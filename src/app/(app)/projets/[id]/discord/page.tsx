import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscordChannelPage } from "@/components/discord/discord-channel-page";
import { requireUser } from "@/lib/auth";
import { isDiscordConfigured } from "@/lib/discord/client";
import { getDiscordChannelView } from "@/lib/discord/service";
import { getProjectsWithStats } from "@/lib/queries";
import { isUuid } from "@/lib/validation";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!isUuid(id)) return null;
  const [[project], channel] = await Promise.all([getProjectsWithStats({ id }), getDiscordChannelView(id)]);
  return project ? { project, channel } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).id);
  // Titre de l'onglet GePro : le nom du salon, comme dans Discord.
  return { title: data?.channel ? `#${data.channel.channelName}` : "Discord" };
}

/** Salon Discord du projet, en pleine page : ouvert dans un onglet GePro depuis le panneau. */
export default async function ProjectDiscordPage({ params }: Props) {
  await requireUser();
  const data = await load((await params).id);
  if (!data) notFound();
  return (
    <DiscordChannelPage
      projectId={data.project.id}
      projectName={data.project.name}
      channel={data.channel}
      configured={isDiscordConfigured()}
    />
  );
}
