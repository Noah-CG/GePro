"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCESS_ERRORS, type DiscordErrorCode } from "@/lib/discord/errors";
import type { DiscordMessage, DiscordMessagesPage } from "@/lib/discord/model";
import { compareSnowflakes, isNewer } from "@/lib/discord/snowflake";
import { PAGE_SIZE } from "@/lib/discord/validation";
import { discordApi, DiscordRequestError, retryDelayOf } from "./api-client";
import { usePolling } from "./use-polling";

/** Panneau ouvert : nouveaux messages toutes les 4 s. */
const POLL_OPEN_MS = 4_000;
/** Regroupe les « lu jusqu'à… » envoyés pendant une rafale de messages. */
const READ_DEBOUNCE_MS = 1_000;

/** Message en cours d'envoi (affiché grisé) ou en échec (avec « Réessayer »). */
export type PendingMessage = { tempId: string; content: string; timestamp: string; status: "sending" | "error"; error?: string };

export type ChannelState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; code: DiscordErrorCode; message: string };

const toErrorState = (e: unknown): ChannelState =>
  e instanceof DiscordRequestError ? { kind: "error", code: e.code, message: e.message } : { kind: "error", code: "unknown", message: String(e) };

/** Fusionne des messages (ajout ou mise à jour d'un message modifié), triés par id. */
function mergeMessages(current: DiscordMessage[], incoming: DiscordMessage[]): DiscordMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => compareSnowflakes(a.id, b.id));
}

/**
 * Messages du salon relié à un projet, tant que le panneau est ouvert : premier chargement,
 * nouveaux messages par interrogation, pages plus anciennes, envoi optimiste, état de lecture.
 * `onSeen(id)` est appelé avec le dernier message affiché (panneau ouvert).
 */
export function useDiscordChannel(projectId: string, open: boolean, onSeen: (messageId: string) => void) {
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [state, setState] = useState<ChannelState>({ kind: "loading" });
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const page = await discordApi<DiscordMessagesPage>(projectId, `messages?limit=${PAGE_SIZE}`);
      setMessages(page.messages);
      setHasOlder(page.hasMore);
      setState({ kind: "ready" });
      loaded.current = true;
    } catch (e) {
      setState(toErrorState(e));
    }
  }, [projectId]);

  // Premier chargement à la première ouverture ; ensuite, l'interrogation rattrape le retard.
  useEffect(() => {
    if (open && !loaded.current) void load();
  }, [open, load]);

  usePolling(
    async () => {
      const last = messagesRef.current.at(-1)?.id;
      try {
        const page = await discordApi<DiscordMessagesPage>(projectId, `messages?${last ? `after=${last}&` : ""}limit=${PAGE_SIZE}`);
        if (page.messages.length) setMessages((current) => mergeMessages(current, page.messages));
        // Page pleine : d'autres messages suivent, on les rattrape sans attendre.
        return page.hasMore && last ? 250 : undefined;
      } catch (e) {
        // Accès retiré entre-temps : on l'explique. Erreur passagère : on réessaie au prochain tour.
        if (e instanceof DiscordRequestError && ACCESS_ERRORS.includes(e.code)) setState(toErrorState(e));
        return retryDelayOf(e);
      }
    },
    POLL_OPEN_MS,
    open && state.kind === "ready",
  );

  const loadOlder = useCallback(async () => {
    const first = messagesRef.current[0]?.id;
    if (!first || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const page = await discordApi<DiscordMessagesPage>(projectId, `messages?before=${first}&limit=${PAGE_SIZE}`);
      setMessages((current) => mergeMessages(current, page.messages));
      setHasOlder(page.hasMore);
    } catch {
      // Le prochain défilement vers le haut réessaiera.
    } finally {
      setLoadingOlder(false);
    }
  }, [projectId, loadingOlder, hasOlder]);

  // État de lecture : « lu jusqu'au dernier message affiché », envoyé après une courte pause.
  const lastReadSent = useRef<string | null>(null);
  const pendingRead = useRef<string | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flushRead = useCallback(() => {
    clearTimeout(readTimer.current);
    const id = pendingRead.current;
    pendingRead.current = null;
    if (!id || !isNewer(id, lastReadSent.current)) return;
    const previous = lastReadSent.current;
    lastReadSent.current = id;
    // keepalive : la requête part même si la page est quittée juste après.
    discordApi(projectId, "read", { method: "POST", body: { messageId: id }, keepalive: true }).catch(() => {
      if (lastReadSent.current === id) lastReadSent.current = previous;
    });
  }, [projectId]);

  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    if (!open || !lastId) return;
    onSeen(lastId);
    pendingRead.current = lastId;
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(flushRead, READ_DEBOUNCE_MS);
  }, [open, lastId, flushRead, onSeen]);

  // Fermeture du panneau (ou de la page) : on envoie tout de suite ce qui attendait.
  useEffect(() => {
    if (!open) flushRead();
  }, [open, flushRead]);
  useEffect(() => flushRead, [flushRead]);

  const post = useCallback(
    async (tempId: string, content: string) => {
      try {
        const { message } = await discordApi<{ message: DiscordMessage }>(projectId, "messages", { method: "POST", body: { content } });
        setMessages((current) => mergeMessages(current, [message]));
        setPending((current) => current.filter((p) => p.tempId !== tempId));
        // Le serveur l'a déjà marqué comme lu : inutile de le renvoyer.
        if (isNewer(message.id, lastReadSent.current)) lastReadSent.current = message.id;
      } catch (e) {
        const error = e instanceof DiscordRequestError ? e.message : "Envoi impossible.";
        setPending((current) => current.map((p) => (p.tempId === tempId ? { ...p, status: "error", error } : p)));
      }
    },
    [projectId],
  );

  const send = useCallback(
    (content: string) => {
      const tempId = crypto.randomUUID();
      setPending((current) => [...current, { tempId, content, timestamp: new Date().toISOString(), status: "sending" }]);
      void post(tempId, content);
    },
    [post],
  );

  const retry = useCallback(
    (tempId: string) => {
      const message = pending.find((p) => p.tempId === tempId);
      if (!message) return;
      setPending((current) => current.map((p) => (p.tempId === tempId ? { ...p, status: "sending", error: undefined } : p)));
      void post(tempId, message.content);
    },
    [pending, post],
  );

  const discard = useCallback((tempId: string) => setPending((current) => current.filter((p) => p.tempId !== tempId)), []);

  return { messages, pending, state, hasOlder, loadingOlder, load, loadOlder, send, retry, discard };
}
