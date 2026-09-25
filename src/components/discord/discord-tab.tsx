"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { DiscordIcon } from "./discord-icon";
import { DISCORD_PANEL_ID } from "./discord-panel";
import { useDiscord } from "./discord-provider";

/** Même forme que les onglets de la barre, réduite au logo. */
const tabShape = "relative flex h-8 w-10 shrink-0 items-center justify-center rounded-t-lg border border-b-0 transition-colors";

/**
 * Onglet fixe Discord, tout à gauche de la barre d'onglets : il ne se ferme pas et suit le projet
 * sélectionné. Sans salon relié, il mène aux paramètres ; sinon il ouvre / ferme le panneau, et une
 * pastille rouge signale les messages non lus. Masqué si l'intégration n'est pas configurée.
 */
export function DiscordTab() {
  const { configured, projectId, channel, open, unread, onDiscordPage, toggle, triggerRef } = useDiscord();
  if (!configured || !projectId) return null;

  const separator = <span aria-hidden className="mx-1 mb-2 h-4 w-px shrink-0 self-end bg-border" />;

  if (!channel) {
    return (
      <>
        <Link
          href={`/projets/${projectId}/parametres#discord`}
          aria-label="Discord"
          title="Relier un salon Discord au projet"
          className={cn(tabShape, "border-transparent text-muted hover:bg-surface-2 hover:text-[#5865F2]")}
        >
          <DiscordIcon size={16} />
        </Link>
        {separator}
      </>
    );
  }

  const active = open || onDiscordPage;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // Salon déjà affiché dans l'onglet actif : le panneau ferait double emploi.
        onClick={onDiscordPage ? undefined : toggle}
        aria-label={unread ? "Discord — nouveaux messages" : "Discord"}
        title={`#${channel.channelName}`}
        aria-expanded={onDiscordPage ? undefined : open}
        aria-controls={onDiscordPage ? undefined : DISCORD_PANEL_ID}
        aria-current={onDiscordPage ? "page" : undefined}
        className={cn(
          tabShape,
          "text-[#5865F2]",
          active ? "border-border bg-surface" : "border-transparent hover:bg-surface-2",
          onDiscordPage && "cursor-default",
        )}
      >
        <span className="relative block">
          <DiscordIcon size={16} />
          {unread && (
            // 8 px dans le coin supérieur droit du logo, bordée de la couleur du fond pour s'en détacher.
            <span aria-hidden className={cn("absolute -top-1 -right-1 h-2 w-2 rounded-full bg-danger ring-2", active ? "ring-surface" : "ring-bg")} />
          )}
        </span>
      </button>
      {separator}
    </>
  );
}
