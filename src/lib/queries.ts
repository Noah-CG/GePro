/**
 * Lectures en base, appelées depuis les Server Components.
 * Les objets renvoyés sont sérialisables (passables tels quels aux composants client).
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, taskAssignees, tasks, users } from "@/db/schema";
import type { TaskPriority, TaskStatus } from "@/db/schema";

export type Member = { id: string; name: string; email: string; role: "admin" | "member"; color: string };

export type ProjectOption = { id: string; name: string; color: string; archived: boolean };

export type ProjectWithStats = {
  id: string;
  name: string;
  description: string;
  color: string;
  startDate: string | null;
  endDate: string | null;
  archived: boolean;
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
};

/** Tâche telle qu'affichée partout dans l'interface. */
export type TaskView = {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  position: number;
  assigneeIds: string[];
};

export async function getTeam(): Promise<Member[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, color: users.color })
    .from(users)
    .orderBy(asc(users.name));
}

/** Liste courte des projets (sélecteurs, navigation). */
export async function getProjectOptions(): Promise<ProjectOption[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name, color: projects.color, archivedAt: projects.archivedAt })
    .from(projects)
    .orderBy(asc(projects.name));
  return rows.map(({ archivedAt, ...p }) => ({ ...p, archived: archivedAt !== null }));
}

/** Projets avec leurs compteurs de tâches (progression, retard). */
export async function getProjectsWithStats(
  opts: { archived?: boolean; id?: string; today?: string } = {},
): Promise<ProjectWithStats[]> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const conditions = [];
  if (opts.id) conditions.push(eq(projects.id, opts.id));
  else if (opts.archived !== undefined)
    conditions.push(opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt));

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      startDate: projects.startDate,
      endDate: projects.endDate,
      archivedAt: projects.archivedAt,
      total: sql<number>`count(${tasks.id})::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      inProgress: sql<number>`count(*) filter (where ${tasks.status} = 'in_progress')::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.status} <> 'done' and ${tasks.dueDate} < ${today})::int`,
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(projects.id)
    .orderBy(asc(projects.endDate), asc(projects.name));

  return rows.map(({ archivedAt, ...p }) => ({ ...p, archived: archivedAt !== null }));
}

/**
 * Tâches enrichies (projet + responsables).
 * Sans `projectId`, renvoie les tâches de tous les projets non archivés.
 */
export async function getTasks(opts: { projectId?: string } = {}): Promise<TaskView[]> {
  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      position: tasks.position,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(opts.projectId ? eq(tasks.projectId, opts.projectId) : isNull(projects.archivedAt))
    .orderBy(asc(tasks.position), desc(tasks.createdAt));

  if (rows.length === 0) return [];

  const links = await db
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(
      inArray(
        taskAssignees.taskId,
        rows.map((r) => r.id),
      ),
    );

  const byTask = new Map<string, string[]>();
  for (const l of links) byTask.set(l.taskId, [...(byTask.get(l.taskId) ?? []), l.userId]);

  return rows.map((r) => ({ ...r, assigneeIds: byTask.get(r.id) ?? [] }));
}
