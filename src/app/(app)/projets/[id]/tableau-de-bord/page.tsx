import { User, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MyDashboard, TeamDashboard } from "@/components/dashboard/dashboard-views";
import { PageHeader } from "@/components/ui/misc";
import { endOfWeekISO, formatLong, todayISO } from "@/lib/dates";
import { loadProjectPage } from "@/lib/project-page";
import { getImportantDays, getTasks, getTeam } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pour?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project } = await loadProjectPage((await params).id);
  return { title: `Tableau de bord · ${project.name}` };
}

/**
 * Tableau de bord d'un projet (aucune donnée des autres projets), en deux vues :
 * « Équipe » (pilotage du projet) et « Mes tâches » (?pour=moi, ma journée de travail).
 */
export default async function DashboardPage({ params, searchParams }: Props) {
  const { id: projectId } = await params;
  const { project, user: me } = await loadProjectPage(projectId);
  const mine = (await searchParams).pour === "moi";
  const today = todayISO();
  const weekEnd = endOfWeekISO(today);
  const base = `/projets/${projectId}/tableau-de-bord`;

  const [tasks, team, importantDays] = await Promise.all([
    getTasks({ projectId, ...(mine && { assigneeId: me.id }) }),
    mine ? null : getTeam(me.id).then((team) => team.filter((m) => m.projectIds.includes(projectId))),
    getImportantDays(projectId, { from: today, limit: 5 }),
  ]);
  const common = { me, project, today, weekEnd, tasks, importantDays };

  const tab = (active: boolean) =>
    cn("flex items-center gap-1.5 rounded-md px-3 py-1.5", active ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-muted hover:text-text");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Bonjour ${me.name.split(" ")[0]} 👋`}
        subtitle={`${project.name} · ${formatLong(today)}`}
        actions={
          <nav aria-label="Vue du tableau de bord" className="flex rounded-lg border border-border bg-surface p-1 text-sm">
            <Link href={base} className={tab(!mine)} aria-current={!mine ? "page" : undefined}>
              <Users size={15} /> Équipe
            </Link>
            <Link href={`${base}?pour=moi`} className={tab(mine)} aria-current={mine ? "page" : undefined}>
              <User size={15} /> Mes tâches
            </Link>
          </nav>
        }
      />

      {team ? <TeamDashboard {...common} team={team} /> : <MyDashboard {...common} />}
    </div>
  );
}
