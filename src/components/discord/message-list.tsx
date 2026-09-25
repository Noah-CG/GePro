"use client";

import { AlertCircle, ArrowDown, Paperclip, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/layout/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/button";
import { buildThread } from "@/lib/discord/grouping";
import type { DiscordAttachment, DiscordEmbed, DiscordMessage } from "@/lib/discord/model";
import { cn } from "@/lib/utils";
import { MessageContent } from "./message-content";
import type { PendingMessage } from "./use-discord-channel";

/** En deçà (px), on considère la liste « en bas » : un nouveau message y fait défiler. */
const BOTTOM_THRESHOLD = 48;
/** À moins de cette distance du haut, on charge la page précédente. */
const TOP_THRESHOLD = 200;

const NO_MENTIONS = { users: {}, roles: {}, channels: {} };

const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" });

type Props = {
  messages: DiscordMessage[];
  pending: PendingMessage[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
};

/**
 * Fil de messages : en bas à l'ouverture, pages plus anciennes au défilement vers le haut (en
 * conservant la position), bouton « Nouveaux messages » si l'on a remonté la liste.
 */
export function MessageList({ messages, pending, hasOlder, loadingOlder, onLoadOlder, onRetry, onDiscard }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  /** Hauteur et position avant l'ajout d'une page plus ancienne, pour rester sur le même message. */
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const previousLastId = useRef<string | undefined>(undefined);
  const previousPending = useRef(pending.length);
  const [showNewButton, setShowNewButton] = useState(false);
  const rows = useMemo(() => buildThread(messages, new Date()), [messages]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setShowNewButton(false);
  }, []);

  const loadOlder = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasOlder || loadingOlder) return;
    anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    onLoadOlder();
  }, [hasOlder, loadingOlder, onLoadOlder]);

  // Page plus ancienne ajoutée en haut : même message à l'écran qu'avant.
  const firstId = messages[0]?.id;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !anchor.current) return;
    el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top;
    anchor.current = null;
  }, [firstId]);

  // Nouveau message en bas : on suit si l'on était en bas (ou à l'ouverture), sinon on le signale.
  const lastId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    if (!lastId || lastId === previousLastId.current) return;
    const initial = previousLastId.current === undefined;
    previousLastId.current = lastId;
    if (initial || atBottom.current) scrollToBottom();
    else setShowNewButton(true);
  }, [lastId, scrollToBottom]);

  // Message que l'on vient d'écrire : toujours visible.
  useLayoutEffect(() => {
    if (pending.length > previousPending.current) scrollToBottom();
    previousPending.current = pending.length;
  }, [pending.length, scrollToBottom]);

  // Liste plus courte que le panneau : impossible de défiler vers le haut, on charge directement.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && hasOlder && !loadingOlder && el.scrollHeight <= el.clientHeight) loadOlder();
  }, [messages.length, hasOlder, loadingOlder, loadOlder]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    if (atBottom.current) setShowNewButton(false);
    if (el.scrollTop < TOP_THRESHOLD) loadOlder();
  }

  /** Une image chargée agrandit la liste : on reste en bas si l'on y était. */
  const onMediaLoad = useCallback(() => {
    if (atBottom.current) scrollToBottom();
  }, [scrollToBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain py-2" role="log" aria-label="Messages">
        {loadingOlder && (
          <div className="flex justify-center py-2 text-muted" aria-busy>
            <Spinner />
            <span className="sr-only">Chargement des messages plus anciens…</span>
          </div>
        )}
        {!hasOlder && messages.length > 0 && <p className="px-4 py-3 text-center text-xs text-muted">Début du salon</p>}

        {rows.map((row) =>
          row.kind === "day" ? (
            <DaySeparator key={row.key} label={row.label} />
          ) : (
            <MessageRow key={row.key} message={row.message} grouped={row.grouped} onMediaLoad={onMediaLoad} />
          ),
        )}
        {pending.map((p) => (
          <PendingRow key={p.tempId} message={p} onRetry={() => onRetry(p.tempId)} onDiscard={() => onDiscard(p.tempId)} />
        ))}
      </div>

      {showNewButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg shadow-lg hover:opacity-90"
        >
          Nouveaux messages <ArrowDown size={13} aria-hidden />
        </button>
      )}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="my-2 flex items-center gap-2 px-4">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium text-muted first-letter:uppercase">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Badge({ children, tone }: { children: string; tone: "accent" | "bot" }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[10px] font-semibold tracking-wide",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-[#5865F2] text-white",
      )}
    >
      {children}
    </span>
  );
}

function MessageRow({ message, grouped, onMediaLoad }: { message: DiscordMessage; grouped: boolean; onMediaLoad: () => void }) {
  const date = new Date(message.timestamp);
  const time = <time dateTime={message.timestamp} title={fullFormat.format(date)}>{timeFormat.format(date)}</time>;

  return (
    <article className={cn("group flex gap-2.5 px-4 hover:bg-surface-2/60", grouped ? "py-0.5" : "mt-2 pt-1 pb-0.5")}>
      <div className="w-8 shrink-0">
        {grouped ? (
          <span className="block pt-0.5 text-right text-[10px] text-muted opacity-0 group-hover:opacity-100">{time}</span>
        ) : (
          <MessageAvatar message={message} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <header className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold">{message.author.name}</span>
            {message.fromGePro ? <Badge tone="accent">via GePro</Badge> : message.author.isBot && <Badge tone="bot">BOT</Badge>}
            <span className="text-[11px] text-muted">{time}</span>
          </header>
        )}
        <MessageContent content={message.content} mentions={message.mentions} />
        {message.editedTimestamp && <span className="text-[10px] text-muted"> (modifié)</span>}
        {message.attachments.length > 0 && (
          <div className="mt-1 space-y-1">
            {message.attachments.map((a) => (
              <Attachment key={a.id} attachment={a} onLoad={onMediaLoad} />
            ))}
          </div>
        )}
        {message.embeds.map((e, i) => (
          <Embed key={i} embed={e} onLoad={onMediaLoad} />
        ))}
      </div>
    </article>
  );
}

/**
 * Avatar Discord ; pour un message écrit depuis GePro, la pastille du membre (le webhook
 * affiche sinon le même avatar pour tout le monde).
 */
function MessageAvatar({ message }: { message: DiscordMessage }) {
  const { team } = useApp();
  const member = message.fromGePro ? team.find((m) => m.name.trim() === message.author.name) : undefined;
  if (member) return <Avatar user={member} size={32} />;
  // eslint-disable-next-line @next/next/no-img-element -- avatar du CDN Discord
  return <img src={message.author.avatarUrl} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 rounded-full bg-surface-2" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function Attachment({ attachment: a, onLoad }: { attachment: DiscordAttachment; onLoad: () => void }) {
  if (a.isImage) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element -- pièce jointe du CDN Discord (adresse signée et temporaire) */}
        <img
          src={a.url}
          alt={a.filename}
          width={a.width ?? undefined}
          height={a.height ?? undefined}
          loading="lazy"
          onLoad={onLoad}
          className="h-auto max-h-72 w-auto max-w-full rounded-md border border-border object-contain"
        />
      </a>
    );
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-fit max-w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm hover:border-accent"
    >
      <Paperclip size={14} className="shrink-0 text-muted" aria-hidden />
      <span className="truncate text-accent">{a.filename}</span>
      <span className="shrink-0 text-xs text-muted">{formatSize(a.size)}</span>
    </a>
  );
}

function Embed({ embed: e, onLoad }: { embed: DiscordEmbed; onLoad: () => void }) {
  return (
    <div className="mt-1 max-w-full rounded-md border-l-4 bg-surface-2 px-3 py-2" style={{ borderLeftColor: e.color ?? "var(--border)" }}>
      {e.authorName && <p className="text-xs font-medium">{e.authorName}</p>}
      {e.title &&
        (e.url ? (
          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-semibold text-accent hover:underline">
            {e.title}
          </a>
        ) : (
          <p className="text-sm font-semibold">{e.title}</p>
        ))}
      {e.description && (
        <div className="mt-0.5 text-muted">
          <MessageContent content={e.description} mentions={NO_MENTIONS} />
        </div>
      )}
      {e.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- image d'aperçu fournie par Discord
        <img src={e.imageUrl} alt="" loading="lazy" onLoad={onLoad} className="mt-2 max-h-60 max-w-full rounded object-contain" />
      )}
      {e.footer && <p className="mt-1 text-[11px] text-muted">{e.footer}</p>}
    </div>
  );
}

function PendingRow({ message, onRetry, onDiscard }: { message: PendingMessage; onRetry: () => void; onDiscard: () => void }) {
  const { me } = useApp();
  const failed = message.status === "error";
  return (
    <article className="mt-2 flex gap-2.5 px-4 pt-1 pb-0.5" aria-busy={!failed}>
      <div className="w-8 shrink-0">
        <Avatar user={me} size={32} className={cn(!failed && "opacity-50")} />
      </div>
      <div className="min-w-0 flex-1">
        <header className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold">{me.name}</span>
          <span className="text-[11px] text-muted">{failed ? "Non envoyé" : "Envoi…"}</span>
        </header>
        <div className={cn(!failed && "opacity-50", failed && "text-danger")}>
          <MessageContent content={message.content} mentions={NO_MENTIONS} />
        </div>
        {failed && (
          <div role="alert" className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1 text-danger">
              <AlertCircle size={13} aria-hidden /> {message.error}
            </span>
            <button onClick={onRetry} className="flex items-center gap-1 font-medium text-accent hover:underline">
              <RotateCw size={12} aria-hidden /> Réessayer
            </button>
            <button onClick={onDiscard} className="flex items-center gap-1 text-muted hover:text-text">
              <X size={12} aria-hidden /> Supprimer
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
