import { AlertCircle, ArrowLeft, CheckCircle2, CircleDot, ListTodo, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardTaskList } from "@/components/dashboard/dashboard-task-list";
import { TaskRates } from "@/components/tasks/task-rates";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader, Section, Stat } from "@/components/ui/misc";
import { requireUser, type SessionUser } from "@/lib/auth";
import { compareByDueThenPriority } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { membersSettingsHref } from "@/lib/members";
import { getAccounts, getTasks, type TaskView } from "@/lib/queries";
import { getSelectedProjectId } from "@/lib/selected-project";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

/** Fiche visible par son titulaire et par les administrateurs de l'application. */
async function loadMember(me: SessionUser, id: string) {
  if (!UUID.test(id) || (me.role !== "admin" && me.id !== id)) return null;
  return (await getAccounts()).find((m) => m.id === id) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const member = await loadMember(await requireUser(), (await params).id);
  return { title: member?.name ?? "Membre" };
}

/**
 * Fiche d'un membre : les tâches qui lui sont assignées dans les projets (non archivés) dont on
 * est soi-même membre. Son temps de travail est sur la page Temps de travail. Visible par les
 * administrateurs de l'application, et par chacun pour sa propre fiche.
 */
export default async function MemberPage({ params }: Props) {
  const me = await requireUser();
  const { id } = await params;
  if (me.role !== "admin" && me.id !== id) redirect("/");
  const member = await loadMember(me, id);
  if (!member) notFound();

  const today = todayISO();
  const tasks = await getTasks({ viewerId: me.id, assigneeId: id });

  const byStatus = (status: TaskView["status"]) =>
    tasks
      .filter((t) => t.status === status)
      .sort(compareByDueThenPriority);
  const done = byStatus("done");
  const inProgress = byStatus("in_progress");
  const todo = byStatus("todo");

  const overdue = tasks.filter((t) => t.status !== "done" && !!t.dueDate && t.dueDate < today).length;

  return (
    <div className="mx-auto max-w-6xl">
      {me.role === "admin" && (
        <Link href={membersSettingsHref(await getSelectedProjectId(me.id))} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
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
        actions={
          <Link href={me.id === member.id ? "/temps" : `/temps?membre=${member.id}`} className={buttonClass({ size: "sm" })}>
            <Timer size={14} /> Temps de travail
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<ListTodo size={16} />} label="Tâches assignées" value={tasks.length} tone="accent" />
        <Stat icon={<CircleDot size={16} />} label="En cours" value={inProgress.length} />
        <Stat icon={<AlertCircle size={16} />} label="En retard" value={overdue} tone={overdue ? "danger" : undefined} />
        <Stat icon={<CheckCircle2 size={16} />} label="Terminées" value={done.length} tone="success" />
      </div>

      <Card className="mb-6 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Avancement des tâches</h2>
          <span className="text-xs text-muted">{tasks.length} tâche{tasks.length > 1 ? "s" : ""}</span>
        </div>
        <TaskRates tasks={tasks} />
      </Card>

      <div className="space-y-6">
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
    </div>
  );
}
