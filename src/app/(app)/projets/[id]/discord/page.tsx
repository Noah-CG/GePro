import type { Metadata } from "next";
import { DiscordChannelPage } from "@/components/discord/discord-channel-page";
import { isDiscordConfigured } from "@/lib/discord/client";
import { getDiscordChannelView } from "@/lib/discord/service";
import { loadProjectPage } from "@/lib/project-page";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const { project } = await loadProjectPage(id);
  return { project, channel: await getDiscordChannelView(id) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).id);
  // Titre de l'onglet GePro : le nom du salon, comme dans Discord.
  return { title: data.channel ? `#${data.channel.channelName}` : "Discord" };
}

/** Salon Discord du projet, en pleine page : ouvert dans un onglet GePro depuis le panneau. */
export default async function ProjectDiscordPage({ params }: Props) {
  const data = await load((await params).id);
  return (
    <DiscordChannelPage
      projectId={data.project.id}
      projectName={data.project.name}
      channel={data.channel}
      configured={isDiscordConfigured()}
    />
  );
}
