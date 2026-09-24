import { AlertCircle, CalendarClock, CircleDashed, FolderKanban, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashboardTaskList } from "@/components/dashboard/dashboard-task-list";
import { WorkTimer } from "@/components/dashboard/work-timer";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PageHeader, ProgressBar, Section, Stat } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { PRIORITY_RANK } from "@/lib/constants";
import { endOfWeekISO, formatLong, formatShort, todayISO } from "@/lib/dates";
import { getProjectsWithStats, getTasks, getTeam, getWorkSummary } from "@/lib/queries";
import { getSelectedProjectId } from "@/lib/selected-project";
import { cn, percent } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

/** Tableau de bord du projet sélectionné (aucune donnée des autres projets). */
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

  const [allTasks, [project], team, work] = await Promise.all([
    getTasks({ projectId }),
    getProjectsWithStats({ id: projectId, today }),
    getTeam(),
    getWorkSummary(me.id, today),
  ]);
  const tasks = mine ? allTasks.filter((t) => t.assigneeIds.includes(me.id)) : allTasks;
  const open = tasks.filter((t) => t.status !== "done");

  const byDueThenPriority = (a: (typeof tasks)[0], b: (typeof tasks)[0]) =>
    a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];

  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort(byDueThenPriority);
  const thisWeek = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).sort(byDueThenPriority);
  const inProgress = open.filter((t) => t.status === "in_progress");
  const totalDone = allTasks.filter((t) => t.status === "done").length;

  // Charge de travail par membre sur ce projet : répond à la question "qui fait quoi ?".
  const workload = team
    .map((m) => {
      const assigned = allTasks.filter((t) => t.status !== "done" && t.assigneeIds.includes(m.id));
      return {
        member: m,
        open: assigned.length,
        inProgress: assigned.filter((t) => t.status === "in_progress").length,
        overdue: assigned.filter((t) => t.dueDate && t.dueDate < today).length,
      };
    })
    .filter((w) => w.open > 0)
    .sort((a, b) => b.open - a.open);
  const maxLoad = Math.max(1, ...workload.map((w) => w.open));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Bonjour ${me.name.split(" ")[0]} 👋`}
        subtitle={`${project.name} · ${formatLong(today)}`}
        actions={
          <div className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            <Link href="/" className={cn("rounded-md px-3 py-1", !mine ? "bg-surface-2 font-medium" : "text-muted")}>
              Équipe
            </Link>
            <Link href="/?pour=moi" className={cn("rounded-md px-3 py-1", mine ? "bg-surface-2 font-medium" : "text-muted")}>
              Mes tâches
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<AlertCircle size={16} />} label="En retard" value={overdue.length} tone={overdue.length ? "danger" : undefined} href={`/projets/${projectId}?vue=liste&echeance=overdue${mine ? "&responsable=moi" : ""}`} />
        <Stat icon={<CalendarClock size={16} />} label="Cette semaine" value={thisWeek.length} tone="warning" href={`/projets/${projectId}?vue=liste&echeance=week${mine ? "&responsable=moi" : ""}`} />
        <Stat icon={<CircleDashed size={16} />} label="En cours" value={inProgress.length} tone="accent" />
        <Stat icon={<TrendingUp size={16} />} label="Avancement" value={`${percent(totalDone, allTasks.length)} %`} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="En retard" count={overdue.length} tone="danger">
            <DashboardTaskList tasks={overdue} empty="Aucune tâche en retard. Bravo !" />
          </Section>
          <Section title="À faire cette semaine" count={thisWeek.length}>
            <DashboardTaskList tasks={thisWeek} empty="Rien d'autre d'ici dimanche." />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Temps de travail" action={<Link href={`/membres/${me.id}`} className="text-xs text-muted hover:text-text">Historique</Link>}>
            <WorkTimer summary={work} />
          </Section>

          <Section title="Progression du projet" action={<Link href={`/projets/${project.id}`} className="text-xs text-muted hover:text-text">Voir les tâches</Link>}>
            <div className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color }} />
                <span className="flex-1 truncate font-medium">{project.name}</span>
                <span className="text-xs text-muted tabular-nums">{percent(project.done, project.total)} %</span>
              </div>
              <ProgressBar value={percent(project.done, project.total)} color={project.color} />
              <p className="text-xs text-muted">
                {project.done}/{project.total} terminées
                {project.overdue > 0 && <span className="text-danger"> · {project.overdue} en retard</span>}
                {project.endDate && ` · fin prévue le ${formatShort(project.endDate)}`}
              </p>
            </div>
          </Section>

          <Section title="Charge de l'équipe">
            {workload.length === 0 && <p className="p-4 text-sm text-muted">Aucune tâche ouverte assignée sur ce projet.</p>}
            <ul className="space-y-3 p-4 empty:hidden">
              {workload.map((w) => (
                <li key={w.member.id} className="flex items-center gap-3">
                  <Avatar user={w.member} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{w.member.name}</span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {w.open} ouverte{w.open > 1 ? "s" : ""}
                        {w.overdue > 0 && <span className="text-danger"> · {w.overdue} en retard</span>}
                      </span>
                    </div>
                    <ProgressBar value={(w.open / maxLoad) * 100} color={w.member.color} className="mt-1" />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
