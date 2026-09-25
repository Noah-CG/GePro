"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { DiscordChannelView, DiscordStatus } from "@/lib/discord/model";
import { isNewer } from "@/lib/discord/snowflake";
import { cn } from "@/lib/utils";
import { discordApi, retryDelayOf } from "./api-client";
import { DISCORD_COLOR, DiscordIcon } from "./discord-icon";
import { DISCORD_PANEL_ID, DiscordPanel } from "./discord-panel";
import { usePolling } from "./use-polling";

/** Panneau fermé : un coup d'œil au salon toutes les 20 s. */
const POLL_CLOSED_MS = 20_000;

/** Même hauteur que le bouton « Nouvelle tâche » voisin. */
const iconButton =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface transition-colors hover:bg-surface-2";

/**
 * Bouton Discord de l'en-tête du projet. Sans salon relié, il mène aux paramètres ; sinon il
 * ouvre / ferme le panneau, et une pastille rouge signale les messages non lus.
 * Masqué si l'intégration n'est pas configurée sur le serveur.
 */
export function DiscordButton({
  projectId,
  channel,
  configured,
}: {
  projectId: string;
  channel: DiscordChannelView | null;
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Le panneau n'est monté qu'à la première ouverture, puis gardé (messages, défilement).
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(false);
  /** Dernier message vu dans le panneau : protège d'un « non lu » périmé (cache, lecture pas encore enregistrée). */
  const lastSeen = useRef<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  usePolling(
    async () => {
      try {
        const status = await discordApi<DiscordStatus>(projectId, "status");
        setUnread(status.unread && isNewer(status.lastMessageId, lastSeen.current));
      } catch (e) {
        // Pastille inchangée : le panneau expliquera l'erreur à l'ouverture.
        return retryDelayOf(e);
      }
    },
    POLL_CLOSED_MS,
    configured && channel !== null && !open,
  );

  const onSeen = useCallback((messageId: string) => {
    if (isNewer(messageId, lastSeen.current)) lastSeen.current = messageId;
    setUnread(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  if (!configured) return null;

  const icon = <DiscordIcon size={18} className="transition-colors" />;

  if (!channel) {
    return (
      <Link
        href={`/projets/${projectId}/parametres#discord`}
        aria-label="Discord"
        title="Relier un salon Discord au projet"
        className={cn(iconButton, "text-muted hover:text-[#5865F2]")}
      >
        {icon}
      </Link>
    );
  }

  const label = unread ? "Discord — nouveaux messages" : "Discord";
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(!open);
          if (!open) setUnread(false);
        }}
        aria-label={label}
        title={`#${channel.channelName}`}
        aria-expanded={open}
        aria-controls={mounted ? DISCORD_PANEL_ID : undefined}
        className={cn(iconButton, open && "border-[#5865F2]/50 bg-[#5865F2]/10")}
        style={{ color: DISCORD_COLOR }}
      >
        <span className="relative block">
          {icon}
          {unread && (
            // 8 px dans le coin supérieur droit du logo, bordée de la couleur du fond pour s'en détacher.
            <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
          )}
        </span>
      </button>
      {mounted && <DiscordPanel projectId={projectId} channel={channel} open={open} onClose={close} onSeen={onSeen} />}
    </>
  );
}
