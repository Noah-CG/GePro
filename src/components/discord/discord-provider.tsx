"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useApp } from "@/components/layout/app-provider";
import type { DiscordChannelView, DiscordStatus } from "@/lib/discord/model";
import { isNewer } from "@/lib/discord/snowflake";
import { discordApi, retryDelayOf } from "./api-client";
import { DiscordPanel } from "./discord-panel";
import { usePolling } from "./use-polling";

/** Panneau fermé : un coup d'œil au salon toutes les 20 s. */
const POLL_CLOSED_MS = 20_000;

type DiscordContextValue = {
  /** Intégration configurée sur le serveur (sinon, rien n'est affiché). */
  configured: boolean;
  /** Projet sélectionné et son salon (null si aucun salon n'est relié). */
  projectId: string | null;
  channel: DiscordChannelView | null;
  open: boolean;
  unread: boolean;
  /** Le salon du projet est affiché dans l'onglet actif (page /projets/<id>/discord). */
  onDiscordPage: boolean;
  toggle: () => void;
  close: () => void;
  /** Dernier message affiché (panneau ou onglet) : efface la pastille. */
  onSeen: (messageId: string) => void;
  /** Onglet fixe de la barre d'onglets : le focus y revient à la fermeture du panneau. */
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const DiscordContext = createContext<DiscordContextValue | null>(null);

export function useDiscord() {
  const ctx = useContext(DiscordContext);
  if (!ctx) throw new Error("useDiscord doit être utilisé dans <DiscordProvider>");
  return ctx;
}

/**
 * Salon Discord du projet sélectionné, pour toute l'application : pastille des messages non lus
 * (interrogée tant que le salon n'est pas affiché) et panneau latéral, qui s'ouvre depuis
 * l'onglet fixe de la barre d'onglets.
 */
export function DiscordProvider({
  configured,
  channels,
  children,
}: {
  configured: boolean;
  /** Salon relié à chaque projet, par id de projet. */
  channels: Record<string, DiscordChannelView>;
  children: ReactNode;
}) {
  const { currentProjectId } = useApp();
  const pathname = usePathname();
  const projectId = configured ? currentProjectId : null;
  const channel = projectId ? (channels[projectId] ?? null) : null;
  const onDiscordPage = projectId !== null && pathname === `/projets/${projectId}/discord`;

  const [open, setOpen] = useState(false);
  // Le panneau n'est monté qu'à la première ouverture, puis gardé (messages, défilement).
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(false);
  /** Dernier message vu, par salon : protège d'un « non lu » périmé (cache, lecture pas encore enregistrée). */
  const lastSeen = useRef(new Map<string, string>());
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const channelId = channel?.channelId ?? null;

  // Autre projet, salon délié, ou salon affiché dans l'onglet : le panneau n'a plus lieu d'être.
  useEffect(() => {
    setUnread(false);
  }, [channelId]);
  useEffect(() => {
    if (!channelId || onDiscordPage) setOpen(false);
  }, [channelId, onDiscordPage]);

  usePolling(
    async () => {
      if (!projectId || !channelId) return;
      try {
        const status = await discordApi<DiscordStatus>(projectId, "status");
        setUnread(status.unread && isNewer(status.lastMessageId, lastSeen.current.get(channelId)));
      } catch (e) {
        // Pastille inchangée : le panneau expliquera l'erreur à l'ouverture.
        return retryDelayOf(e);
      }
    },
    POLL_CLOSED_MS,
    channelId !== null && !open && !onDiscordPage,
    `${projectId}:${channelId}`,
  );

  const onSeen = useCallback(
    (messageId: string) => {
      if (!channelId) return;
      if (isNewer(messageId, lastSeen.current.get(channelId))) lastSeen.current.set(channelId, messageId);
      setUnread(false);
    },
    [channelId],
  );

  const toggle = useCallback(() => {
    if (!channelId) return;
    setMounted(true);
    setOpen((o) => !o);
    setUnread(false);
  }, [channelId]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const value: DiscordContextValue = { configured, projectId, channel, open, unread, onDiscordPage, toggle, close, onSeen, triggerRef };

  return (
    <DiscordContext.Provider value={value}>
      {children}
      {/* Un panneau par projet : changer de projet repart d'un fil vide, sans mélanger les salons. */}
      {mounted && projectId && channel && (
        <DiscordPanel key={projectId} projectId={projectId} channel={channel} open={open} onClose={close} onSeen={onSeen} />
      )}
    </DiscordContext.Provider>
  );
}
