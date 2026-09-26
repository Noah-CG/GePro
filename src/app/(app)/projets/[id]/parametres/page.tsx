import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DiscordChannelCard } from "@/components/discord/discord-channel-card";
import { GoogleConnectionCard, type Notice } from "@/components/integrations/google-connection-card";
import { MembersManager } from "@/components/members/members-manager";
import { ProjectDangerZone, ProjectMembers } from "@/components/projects/project-members";
import { PageHeader } from "@/components/ui/misc";
import { isDiscordConfigured } from "@/lib/discord/client";
import { getDiscordChannelView } from "@/lib/discord/service";
import { integrationErrorMessage, isIntegrationErrorCode } from "@/lib/integrations/errors";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { MEMBERS_SECTION_ID } from "@/lib/members";
import { loadProjectPage } from "@/lib/project-page";
import { atLeast } from "@/lib/access";
import { getAccounts, getConnectionView, getPendingInvitations, getProjectMembers } from "@/lib/queries";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project } = await loadProjectPage((await params).id);
  return { title: `Paramètres · ${project.name}` };
}

/** Message de retour après la connexion Google (?google=connected ou ?google=error&reason=<code>). */
function oauthNotice(google: unknown, reason: unknown): Notice | null {
  if (google === "connected") return { kind: "success", message: "Compte Google connecté. Vous pouvez rattacher des documents au projet." };
  if (google === "error") return { kind: "error", message: integrationErrorMessage(isIntegrationErrorCode(reason) ? reason : "unknown") };
  return null;
}

export default async function ProjectSettingsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { project, user: me, role } = await loadProjectPage(id);
  const { google, reason } = await searchParams;
  const manager = atLeast(role, "admin");
  const [connection, discordChannel, members, invitations, accounts] = await Promise.all([
    getConnectionView(me.id, "google"),
    getDiscordChannelView(project.id),
    getProjectMembers(project.id),
    manager ? getPendingInvitations(project.id) : [],
    // Gestion des comptes : réservée aux administrateurs de l'application, comme les actions de
    // actions/members.ts. Sans rapport avec le rôle dans ce projet.
    me.role === "admin" ? getAccounts() : null,
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/projets/${project.id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> {project.name}
      </Link>
      <PageHeader title="Paramètres du projet" />

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">Membres</h2>
        <p className="mb-3 text-sm text-muted">
          Seuls les membres voient le projet et ses données. On n&apos;y entre que sur invitation
          {manager ? "." : " d'un propriétaire ou d'un administrateur."}
        </p>
        <ProjectMembers projectId={project.id} myRole={role} members={members} invitations={invitations} />
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">Intégrations</h2>
        <p className="mb-3 text-sm text-muted">Reliez vos outils pour retrouver les documents et les discussions du projet au même endroit.</p>
        <GoogleConnectionCard
          projectId={project.id}
          configured={isGoogleConfigured()}
          connection={connection}
          notice={oauthNotice(google, reason)}
        />
        <div className="mt-3">
          <DiscordChannelCard projectId={project.id} configured={isDiscordConfigured()} channel={discordChannel} canManage={manager} />
        </div>
      </section>

      {accounts && (
        <section id={MEMBERS_SECTION_ID} className="mb-8 scroll-mt-4">
          <h2 className="mb-1 text-sm font-semibold">Comptes de l&apos;équipe</h2>
          <p className="mb-3 text-sm text-muted">
            Créez les comptes et communiquez les identifiants à chaque membre. Les comptes sont communs à tous les
            projets, mais un nouveau compte ne voit aucun projet tant qu&apos;il n&apos;y est pas invité.
          </p>
          <MembersManager team={accounts} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">{role === "owner" ? "Zone de danger" : "Quitter le projet"}</h2>
        <ProjectDangerZone projectId={project.id} projectName={project.name} myRole={role} />
      </section>
    </div>
  );
}
