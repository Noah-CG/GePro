import { FolderKanban, User, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MyDashboard, TeamDashboard } from "@/components/dashboard/dashboard-views";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { endOfWeekISO, formatLong, todayISO } from "@/lib/dates";
import { getProjectsWithStats, getProjectTeamWork, getTasks, getTeam, getWorkSummary } from "@/lib/queries";
import { getSelectedProjectId } from "@/lib/selected-project";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

/**
 * Tableau de bord du projet sélectionné (aucune donnée des autres projets), en deux vues :
 * « Équipe » (pilotage du projet) et « Mes tâches » (?pour=moi, ma journée de travail).
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ pour?: string }> }) {
  const me = await requireUser();
  const mine = (await searchParams).pour === "moi";
  const today = todayISO();
  const weekEnd = endOfWeekISO(today);

  const projectId = await getSelectedProjectId();
  if (!projectId) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title={`Bonjour ${me.name.split(" ")[0]} 👋`} subtitle={formatLong(today)} />
        <EmptyState icon={<FolderKanban size={28} />} title="Aucun projet pour l'instant">
          Créez votre premier projet avec le bouton en haut de la barre latérale ou la touche P.
        </EmptyState>
      </div>
    );
  }

  const [tasks, [project], work, teamData] = await Promise.all([
    getTasks({ projectId, ...(mine && { assigneeId: me.id }) }),
    getProjectsWithStats({ id: projectId, today }),
    getWorkSummary(me.id, today),
    mine ? null : Promise.all([getTeam(), getProjectTeamWork(projectId, today)]),
  ]);
  const common = { me, project, work, today, weekEnd, tasks };

  const tab = (active: boolean) =>
    cn("flex items-center gap-1.5 rounded-md px-3 py-1.5", active ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-muted hover:text-text");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Bonjour ${me.name.split(" ")[0]} 👋`}
        subtitle={`${project.name} · ${formatLong(today)}`}
        actions={
          <nav aria-label="Vue du tableau de bord" className="flex rounded-lg border border-border bg-surface p-1 text-sm">
            <Link href="/" className={tab(!mine)} aria-current={!mine ? "page" : undefined}>
              <Users size={15} /> Équipe
            </Link>
            <Link href="/?pour=moi" className={tab(mine)} aria-current={mine ? "page" : undefined}>
              <User size={15} /> Mes tâches
            </Link>
          </nav>
        }
      />

      {teamData ? <TeamDashboard {...common} team={teamData[0]} teamWork={teamData[1]} /> : <MyDashboard {...common} />}
    </div>
  );
}
