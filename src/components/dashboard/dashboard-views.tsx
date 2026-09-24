/**
 * Les deux vues du tableau de bord (Server Components) :
 * - « Mes tâches » répond à « qu'est-ce que je dois faire maintenant ? » ;
 * - « Équipe » répond à « où en est le projet, et qui est débordé ? ».
 */
import { AlertCircle, CalendarClock, ListTodo, TrendingUp, UserX } from "lucide-react";
import Link from "next/link";
import { DashboardTaskList } from "@/components/dashboard/dashboard-task-list";
import { TaskRates } from "@/components/tasks/task-rates";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ProgressBar, Section, Stat } from "@/components/ui/misc";
import type { SessionUser } from "@/lib/auth";
import { compareByDueThenPriority } from "@/lib/constants";
import { formatShort } from "@/lib/dates";
import type { Member, ProjectWithStats, TaskView } from "@/lib/queries";
import { percent } from "@/lib/utils";

type Common = {
  me: SessionUser;
  project: ProjectWithStats;
  today: string;
  weekEnd: string;
};

const isOverdue = (t: TaskView, today: string) => !!t.dueDate && t.dueDate < today;
const isThisWeek = (t: TaskView, today: string, weekEnd: string) => !!t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd;

/** Vue personnelle : toute ma file de travail, échéance ou pas. */
export function MyDashboard({ project, today, weekEnd, tasks }: Common & { tasks: TaskView[] }) {
  const listUrl = (echeance: string) => `/projets/${project.id}?vue=liste&echeance=${echeance}&responsable=moi`;
  const open = tasks.filter((t) => t.status !== "done").sort(compareByDueThenPriority);
  const todo = open.filter((t) => t.status === "todo");

  // Chaque tâche ouverte apparaît dans un seul groupe, du plus urgent au moins urgent.
  const groups = [
    { title: "En cours", tasks: open.filter((t) => t.status === "in_progress") },
    { title: "En retard", tasks: todo.filter((t) => isOverdue(t, today)), tone: "danger" as const },
    { title: "Cette semaine", tasks: todo.filter((t) => isThisWeek(t, today, weekEnd)) },
    { title: "Plus tard ou sans échéance", tasks: todo.filter((t) => !t.dueDate || t.dueDate > weekEnd) },
  ].filter((g) => g.tasks.length > 0);

  const overdue = open.filter((t) => isOverdue(t, today)).length;
  const thisWeek = open.filter((t) => isThisWeek(t, today, weekEnd)).length;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<ListTodo size={16} />} label="Mes tâches ouvertes" value={open.length} tone="accent" href={`/projets/${project.id}?vue=liste&responsable=moi`} />
        <Stat icon={<AlertCircle size={16} />} label="En retard" value={overdue} tone={overdue ? "danger" : undefined} href={listUrl("overdue")} />
        <Stat icon={<CalendarClock size={16} />} label="Cette semaine" value={thisWeek} tone="warning" href={listUrl("week")} />
        <Stat icon={<TrendingUp size={16} />} label="Mon avancement" value={`${percent(tasks.length - open.length, tasks.length)} %`} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {groups.length === 0 && (
            <EmptyState icon={<ListTodo size={28} />} title="Aucune tâche ouverte pour vous sur ce projet">
              Les tâches qui vous sont assignées apparaîtront ici.
            </EmptyState>
          )}
          {groups.map((g) => (
            <Section key={g.title} title={g.title} count={g.tasks.length} tone={g.tone}>
              <DashboardTaskList tasks={g.tasks} empty="" />
            </Section>
          ))}
        </div>

        <div className="space-y-6">
          <Section title="Ma répartition">
            <div className="p-4">
              {tasks.length === 0 ? <p className="text-sm text-muted">Aucune tâche assignée.</p> : <TaskRates tasks={tasks} />}
            </div>
          </Section>
          <ProjectProgress project={project} />
        </div>
      </div>
    </>
  );
}

/** Vue d'équipe : ce qui glisse, ce qui n'est pris par personne, et la charge de chacun. */
export function TeamDashboard({ me, project, today, weekEnd, tasks, team }: Common & { tasks: TaskView[]; team: Member[] }) {
  const listUrl = (query: string) => `/projets/${project.id}?vue=liste&${query}`;
  const open = tasks.filter((t) => t.status !== "done").sort(compareByDueThenPriority);
  const overdue = open.filter((t) => isOverdue(t, today));
  const thisWeek = open.filter((t) => isThisWeek(t, today, weekEnd));
  const unassigned = open.filter((t) => t.assigneeIds.length === 0);

  const canOpen = (m: Member) => me.role === "admin" || m.id === me.id;

  // Charge par membre : tâches ouvertes sur ce projet (le temps passé est sur la page Temps de travail).
  const workload = team
    .map((m) => {
      const assigned = open.filter((t) => t.assigneeIds.includes(m.id));
      return { member: m, open: assigned.length, overdue: assigned.filter((t) => isOverdue(t, today)).length };
    })
    .filter((w) => w.open > 0)
    .sort((a, b) => b.open - a.open || a.member.name.localeCompare(b.member.name));
  const maxLoad = Math.max(1, ...workload.map((w) => w.open));

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<AlertCircle size={16} />} label="En retard" value={overdue.length} tone={overdue.length ? "danger" : undefined} href={listUrl("echeance=overdue")} />
        <Stat icon={<CalendarClock size={16} />} label="Cette semaine" value={thisWeek.length} tone="warning" href={listUrl("echeance=week")} />
        <Stat icon={<UserX size={16} />} label="Non assignées" value={unassigned.length} tone={unassigned.length ? "accent" : undefined} href={listUrl("responsable=aucun")} />
        <Stat icon={<TrendingUp size={16} />} label="Avancement du projet" value={`${percent(project.done, project.total)} %`} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="En retard" count={overdue.length} tone="danger">
            <DashboardTaskList tasks={overdue} empty="Aucune tâche en retard. Bravo !" />
          </Section>
          <Section title="À faire cette semaine" count={thisWeek.length}>
            <DashboardTaskList tasks={thisWeek} empty="Rien d'autre d'ici dimanche." />
          </Section>
          <Section title="Non assignées" count={unassigned.length}>
            <DashboardTaskList tasks={unassigned} empty="Toutes les tâches ouvertes ont un responsable." />
          </Section>
        </div>

        <div className="space-y-6">
          <ProjectProgress project={project} />

          <Section title="Charge de l'équipe" action={<Link href="/temps" className="text-xs text-muted hover:text-text">Temps de travail</Link>}>
            {workload.length === 0 && <p className="p-4 text-sm text-muted">Aucune tâche ouverte assignée sur ce projet.</p>}
            <ul className="space-y-3 p-4 empty:hidden">
              {workload.map((w) => {
                const name = <span className="truncate">{w.member.name}</span>;
                return (
                  <li key={w.member.id} className="flex items-center gap-3">
                    <Avatar user={w.member} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        {canOpen(w.member) ? (
                          <Link href={`/membres/${w.member.id}`} className="min-w-0 truncate hover:text-accent hover:underline">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                        <span className="shrink-0 text-xs text-muted tabular-nums">
                          {w.open} ouverte{w.open > 1 ? "s" : ""}
                          {w.overdue > 0 && <span className="text-danger"> · {w.overdue} en retard</span>}
                        </span>
                      </div>
                      <ProgressBar value={(w.open / maxLoad) * 100} color={w.member.color} className="mt-1" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}

function ProjectProgress({ project }: { project: ProjectWithStats }) {
  return (
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
  );
}
