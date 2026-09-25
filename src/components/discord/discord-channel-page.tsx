"use client";

import { ExternalLink, Settings } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { discordErrorMessage } from "@/lib/discord/errors";
import type { DiscordChannelView } from "@/lib/discord/model";
import { channelUrl } from "@/lib/discord/urls";
import { DiscordConversation } from "./discord-conversation";
import { DISCORD_COLOR, DiscordIcon } from "./discord-icon";
import { useDiscord } from "./discord-provider";

/**
 * Salon Discord du projet en pleine page (onglet GePro). Occupe toute la hauteur disponible sous
 * la barre d'onglets : seul le fil de messages défile.
 */
export function DiscordChannelPage({
  projectId,
  projectName,
  channel,
  configured,
}: {
  projectId: string;
  projectName: string;
  channel: DiscordChannelView | null;
  configured: boolean;
}) {
  const { onSeen } = useDiscord();

  if (!configured || !channel) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={<DiscordIcon size={28} />} title={configured ? "Aucun salon Discord relié à ce projet" : "Intégration Discord non configurée"}>
          <p>{discordErrorMessage(configured ? "not_linked" : "not_configured")}</p>
          {configured && (
            <Link href={`/projets/${projectId}/parametres#discord`} className={buttonClass({ size: "sm", className: "mt-4" })}>
              <Settings size={14} /> Relier un salon
            </Link>
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    // Hauteur de l'écran moins l'en-tête mobile, la barre d'onglets et les marges de <main>.
    <div className="mx-auto flex h-[calc(100dvh-9.75rem)] min-h-96 max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface md:h-[calc(100dvh-6.5rem)]">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <span style={{ color: DISCORD_COLOR }}>
          <DiscordIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            <span className="text-muted">#</span>
            {channel.channelName}
          </h1>
          <p className="truncate text-xs text-muted">{projectName}</p>
        </div>
        <a
          href={channelUrl(channel.guildId, channel.channelId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
        >
          Ouvrir dans Discord <ExternalLink size={12} aria-hidden />
        </a>
      </header>
      <DiscordConversation projectId={projectId} channel={channel} active onSeen={onSeen} />
    </div>
  );
}
