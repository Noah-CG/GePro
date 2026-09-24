import { ArrowLeft, CalendarDays, CheckCircle2, Clock, ListTodo, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardTaskList } from "@/components/dashboard/dashboard-task-list";
import { TaskRates } from "@/components/tasks/task-rates";
import { Avatar } from "@/components/ui/avatar";
import { Card, PageHeader, Section, Stat } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { compareByDueThenPriority } from "@/lib/constants";
import { formatDateTime, formatDuration, formatTime, todayISO } from "@/lib/dates";
import { getTasks, getTeam, getWorkByProject, getWorkSessions, getWorkSummary, type TaskView } from "@/lib/queries";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

async function loadMember(id: string) {
  if (!UUID.test(id)) return null;
  return (await getTeam()).find((m) => m.id === id) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const member = await loadMember((await params).id);
  return { title: member?.name ?? "Membre" };
}

/**
 * Fiche d'un membre : temps de travail mesuré au chrono et tâches qui lui sont assignées
 * (projets non archivés). Visible par les administrateurs, et par chacun pour sa propre fiche.
 */
export default async function MemberPage({ params }: Props) {
  const me = await requireUser();
  const { id } = await params;
  if (me.role !== "admin" && me.id !== id) redirect("/");
  const member = await loadMember(id);
  if (!member) notFound();

  const today = todayISO();
  const [tasks, work, sessions, byProject] = await Promise.all([
    getTasks({ assigneeId: id }),
    getWorkSummary(id, today),
    getWorkSessions(id),
    getWorkByProject(id),
  ]);

  // Le chrono en cours compte dans les totaux affichés.
  const running = work.runningSince ? Date.now() - new Date(work.runningSince).getTime() : 0;
  const totalMs = work.totalMs + running;

  const byStatus = (status: TaskView["status"]) =>
    tasks
      .filter((t) => t.status === status)
      .sort(compareByDueThenPriority);
  const done = byStatus("done");
  const inProgress = byStatus("in_progress");
  const todo = byStatus("todo");

  const projectMax = Math.max(1, ...byProject.map((p) => p.ms));

  return (
    <div className="mx-auto max-w-6xl">
      {me.role === "admin" && (
        <Link href="/membres" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft size={14} /> Membres
        </Link>
      )}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar user={member} size={36} />
            {member.name}
          </span>
        }
        subtitle={`${member.email}${member.role === "admin" ? " · Administrateur" : ""}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Timer size={16} />} label="Temps de travail total" value={formatDuration(totalMs)} tone="accent" />
        <Stat icon={<CalendarDays size={16} />} label="Cette semaine" value={formatDuration(work.weekMs + running)} />
        <Stat icon={<Clock size={16} />} label="Aujourd'hui" value={formatDuration(work.todayMs + running)} />
        <Stat icon={<ListTodo size={16} />} label="Tâches assignées" value={tasks.length} />
      </div>

      <Card className="mb-6 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Avancement des tâches</h2>
          <span className="text-xs text-muted">{tasks.length} tâche{tasks.length > 1 ? "s" : ""}</span>
        </div>
        <TaskRates tasks={tasks} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title="En cours" count={inProgress.length}>
            <DashboardTaskList tasks={inProgress} empty="Aucune tâche en cours." />
          </Section>
          <Section title="Pas encore commencées" count={todo.length}>
            <DashboardTaskList tasks={todo} empty="Aucune tâche à faire." />
          </Section>
          <Section title="Terminées" count={done.length}>
            <DashboardTaskList tasks={done} empty="Aucune tâche terminée pour l'instant." />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Temps par projet">
            {byProject.length === 0 && <p className="p-4 text-sm text-muted">Aucun temps enregistré.</p>}
            <ul className="space-y-3 p-4 empty:hidden">
              {byProject.map((p) => (
                <li key={p.projectId ?? "none"}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? "var(--muted)" }} />
                      <span className="truncate">{p.name ?? "Sans projet"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{formatDuration(p.ms)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${(p.ms / projectMax) * 100}%`, background: p.color ?? "var(--muted)" }} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Dernières sessions" count={work.sessions}>
            {sessions.length === 0 && <p className="p-4 text-sm text-muted">Le chrono n&apos;a encore jamais été lancé.</p>}
            <ul className="divide-y divide-border empty:hidden">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {s.endedAt ? (
                    <CheckCircle2 size={14} className="shrink-0 text-muted" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {formatDateTime(s.startedAt)}
                      {s.endedAt ? ` → ${formatTime(s.endedAt)}` : " → en cours"}
                    </p>
                    {s.projectName && (
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.projectColor ?? undefined }} />
                        <span className="truncate">{s.projectName}</span>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-medium tabular-nums">
                    {formatDuration((s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - new Date(s.startedAt).getTime())}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
