import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscordChannelCard } from "@/components/discord/discord-channel-card";
import { GoogleConnectionCard, type Notice } from "@/components/integrations/google-connection-card";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { isDiscordConfigured } from "@/lib/discord/client";
import { getDiscordChannelView } from "@/lib/discord/service";
import { integrationErrorMessage, isIntegrationErrorCode } from "@/lib/integrations/errors";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { getConnectionView, getProjectsWithStats } from "@/lib/queries";
import { isUuid } from "@/lib/validation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadProject(id: string) {
  if (!isUuid(id)) return null;
  const [project] = await getProjectsWithStats({ id });
  return project ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await loadProject((await params).id);
  return { title: project ? `Paramètres · ${project.name}` : "Paramètres" };
}

/** Message de retour après la connexion Google (?google=connected ou ?google=error&reason=<code>). */
function oauthNotice(google: unknown, reason: unknown): Notice | null {
  if (google === "connected") return { kind: "success", message: "Compte Google connecté. Vous pouvez rattacher des documents au projet." };
  if (google === "error") return { kind: "error", message: integrationErrorMessage(isIntegrationErrorCode(reason) ? reason : "unknown") };
  return null;
}

export default async function ProjectSettingsPage({ params, searchParams }: Props) {
  const me = await requireUser();
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const { google, reason } = await searchParams;
  const [connection, discordChannel] = await Promise.all([getConnectionView(me.id, "google"), getDiscordChannelView(project.id)]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/projets/${project.id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> {project.name}
      </Link>
      <PageHeader title="Paramètres du projet" />

      <section>
        <h2 className="mb-1 text-sm font-semibold">Intégrations</h2>
        <p className="mb-3 text-sm text-muted">Reliez vos outils pour retrouver les documents et les discussions du projet au même endroit.</p>
        <GoogleConnectionCard
          projectId={project.id}
          configured={isGoogleConfigured()}
          connection={connection}
          notice={oauthNotice(google, reason)}
        />
        <div className="mt-3">
          <DiscordChannelCard projectId={project.id} configured={isDiscordConfigured()} channel={discordChannel} />
        </div>
      </section>
    </div>
  );
}
