"use client";

import { AlertTriangle, ExternalLink, MessagesSquare, RotateCw, Settings, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCESS_ERRORS } from "@/lib/discord/errors";
import type { DiscordChannelView } from "@/lib/discord/model";
import { channelUrl, DISCORD_DOCS_URL } from "@/lib/discord/urls";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { DISCORD_COLOR, DiscordIcon } from "./discord-icon";
import { useDiscordChannel, type ChannelState } from "./use-discord-channel";

export const DISCORD_PANEL_ID = "panneau-discord";

/**
 * Panneau latéral droit du salon Discord : superposé à la page sans l'assombrir (on peut
 * continuer à la consulter), plein écran sur mobile. Reste monté une fois ouvert, pour
 * retrouver messages et position de lecture ; fermé, il est inerte et n'interroge plus Discord.
 */
export function DiscordPanel({
  projectId,
  channel,
  open,
  onClose,
  onSeen,
}: {
  projectId: string;
  channel: DiscordChannelView;
  open: boolean;
  onClose: () => void;
  onSeen: (messageId: string) => void;
}) {
  const discord = useDiscordChannel(projectId, open, onSeen);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const ready = discord.state.kind === "ready";

  // Échap ferme le panneau, sauf si une fenêtre modale est ouverte par-dessus (elle se ferme d'abord).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Saisie prête dès l'ouverture.
  useEffect(() => {
    if (open && ready) composerRef.current?.focus({ preventScroll: true });
  }, [open, ready]);

  return (
    <aside
      id={DISCORD_PANEL_ID}
      aria-label={`Discord, salon #${channel.channelName}`}
      inert={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-surface shadow-2xl md:w-[380px]",
        "transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none",
        open ? "visible translate-x-0" : "invisible translate-x-full",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border pr-2 pl-2">
        {/*
          Le panneau recouvre le logo de l'en-tête de la page : on le répète ici pour que « recliquer
          sur le logo » ferme toujours le panneau.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Discord"
          aria-expanded="true"
          aria-controls={DISCORD_PANEL_ID}
          title="Fermer le panneau Discord"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2"
          style={{ color: DISCORD_COLOR }}
        >
          <DiscordIcon size={18} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          <span className="text-muted">#</span>
          {channel.channelName}
        </h2>
        <a
          href={channelUrl(channel.guildId, channel.channelId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
        >
          Ouvrir dans Discord <ExternalLink size={12} aria-hidden />
        </a>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer le panneau Discord">
          <X size={16} />
        </Button>
      </header>

      {discord.state.kind === "loading" && <LoadingState />}
      {discord.state.kind === "error" && <ErrorState state={discord.state} projectId={projectId} onRetry={() => void discord.load()} />}
      {ready &&
        (discord.messages.length === 0 && discord.pending.length === 0 ? (
          <EmptyChannel name={channel.channelName} />
        ) : (
          <MessageList
            messages={discord.messages}
            pending={discord.pending}
            hasOlder={discord.hasOlder}
            loadingOlder={discord.loadingOlder}
            onLoadOlder={() => void discord.loadOlder()}
            onRetry={discord.retry}
            onDiscard={discord.discard}
          />
        ))}
      {ready && <Composer ref={composerRef} channelName={channel.channelName} onSend={discord.send} />}
    </aside>
  );
}

function LoadingState() {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-5/12", "w-3/5", "w-1/3"];
  return (
    <div role="status" aria-busy="true" className="flex-1 space-y-5 overflow-hidden px-4 py-4">
      <span className="sr-only">Chargement des messages…</span>
      {widths.map((w, i) => (
        <div key={i} className="flex gap-2.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className={cn("h-3.5", w)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChannel({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <MessagesSquare size={28} className="mb-3 text-muted" aria-hidden />
      <p className="text-sm font-medium">Aucun message dans #{name}</p>
      <p className="mt-1 text-sm text-muted">Lancez la conversation : votre message sera publié sous votre nom.</p>
    </div>
  );
}

function ErrorState({ state, projectId, onRetry }: { state: Extract<ChannelState, { kind: "error" }>; projectId: string; onRetry: () => void }) {
  const access = ACCESS_ERRORS.includes(state.code);
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <AlertTriangle size={26} className="mb-3 text-warning" aria-hidden />
      <p className="text-sm font-medium">{access ? "Le bot GePro n'a pas accès au salon" : "Impossible de charger les messages"}</p>
      <p className="mt-1 text-sm text-muted">{state.message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={onRetry}>
          <RotateCw size={14} /> Réessayer
        </Button>
        {access && (
          <>
            <a href={DISCORD_DOCS_URL} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "sm", variant: "ghost" })}>
              Guide de configuration <ExternalLink size={12} aria-hidden />
            </a>
            <Link href={`/projets/${projectId}/parametres#discord`} className={buttonClass({ size: "sm", variant: "ghost" })}>
              <Settings size={14} /> Paramètres
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
