"use client";

import { AlertTriangle, ExternalLink, MessagesSquare, RotateCw, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCESS_ERRORS } from "@/lib/discord/errors";
import type { DiscordChannelView } from "@/lib/discord/model";
import { DISCORD_DOCS_URL } from "@/lib/discord/urls";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { useDiscordChannel, type ChannelState } from "./use-discord-channel";

/**
 * Contenu d'un salon : chargement, erreur, fil de messages et saisie. Partagé par le panneau
 * latéral et la page ouverte dans un onglet. `active` : affiché à l'écran (interroge Discord et
 * marque les messages comme lus) ; sinon, en veille.
 */
export function DiscordConversation({
  projectId,
  channel,
  active,
  onSeen,
}: {
  projectId: string;
  channel: DiscordChannelView;
  active: boolean;
  onSeen: (messageId: string) => void;
}) {
  const discord = useDiscordChannel(projectId, active, onSeen);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const ready = discord.state.kind === "ready";

  // Saisie prête dès l'affichage.
  useEffect(() => {
    if (active && ready) composerRef.current?.focus({ preventScroll: true });
  }, [active, ready]);

  return (
    <>
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
    </>
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
