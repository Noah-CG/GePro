/**
 * Lectures en base, appelées depuis les Server Components.
 * Les objets renvoyés sont sérialisables (passables tels quels aux composants client).
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalConnections, externalResources, projects, taskAssignees, tasks, users, workSessions } from "@/db/schema";
import type { IntegrationProvider, TaskPriority, TaskStatus } from "@/db/schema";
import { addDays, APP_TIMEZONE, endOfWeekISO, formatDateTime } from "@/lib/dates";
import { isIntegrationErrorCode, type IntegrationErrorCode } from "@/lib/integrations/errors";

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

/** Connexion d'un utilisateur à un fournisseur, sans aucun jeton. */
export type ConnectionView = { status: "active" | "needs_reauth"; email: string };

/** Ressource externe telle qu'affichée dans la page Documents et la page de lecture. */
export type ResourceView = {
  id: string;
  projectId: string;
  provider: IntegrationProvider;
  kind: string;
  externalId: string;
  title: string;
  url: string;
  /** "12 oct. 2026 à 14:32", déjà formaté dans le fuseau de l'équipe. */
  updatedLabel: string | null;
  /**
   * Problème de synchronisation : "disconnected" si le compte qui la synchronisait a été
   * déconnecté, sinon le code de la dernière erreur. Null si tout va bien.
   */
  problem: IntegrationErrorCode | null;
  attachedByName: string | null;
};

/** Ressource telle que listée dans la barre latérale. */
export type ResourceLink = { id: string; projectId: string; externalId: string; title: string; hasProblem: boolean };

/**
 * Temps de travail d'un membre, en millisecondes, périodes terminées uniquement : le chrono en
 * cours (`runningSince`) est ajouté par l'appelant, qui peut ainsi le faire défiler en direct.
 * Une période compte pour le jour (fuseau de l'équipe) où elle a démarré.
 */
export type WorkSummary = {
  runningSince: string | null;
  todayMs: number;
  weekMs: number;
  totalMs: number;
  sessions: number;
};

/** Période de travail telle qu'affichée dans l'historique d'un membre. */
export type WorkSessionView = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  projectName: string | null;
  projectColor: string | null;
};

/** Temps de travail cumulé par projet (null = aucun projet sélectionné au démarrage). */
export type ProjectTime = { projectId: string | null; name: string | null; color: string | null; ms: number };

/** Au-delà, les métadonnées en cache sont rafraîchies à l'affichage de la page projet. */
const RESOURCE_TTL_MS = 15 * 60_000;

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
export async function getTasks(opts: { projectId?: string; assigneeId?: string } = {}): Promise<TaskView[]> {
  const scope = opts.projectId ? eq(tasks.projectId, opts.projectId) : isNull(projects.archivedAt);
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
    .where(
      opts.assigneeId
        ? and(
            scope,
            inArray(
              tasks.id,
              db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, opts.assigneeId)),
            ),
          )
        : scope,
    )
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

export async function getConnectionView(userId: string, provider: IntegrationProvider): Promise<ConnectionView | null> {
  const [row] = await db
    .select({ status: externalConnections.status, email: externalConnections.accountEmail })
    .from(externalConnections)
    .where(and(eq(externalConnections.userId, userId), eq(externalConnections.provider, provider)))
    .limit(1);
  return row ?? null;
}

const resourceColumns = {
  id: externalResources.id,
  projectId: externalResources.projectId,
  provider: externalResources.provider,
  kind: externalResources.kind,
  externalId: externalResources.externalId,
  title: externalResources.title,
  url: externalResources.url,
  externalUpdatedAt: externalResources.externalUpdatedAt,
  syncedAt: externalResources.syncedAt,
  syncError: externalResources.syncError,
  connectionId: externalResources.connectionId,
  attachedByName: users.name,
};

const selectResources = () =>
  db.select(resourceColumns).from(externalResources).leftJoin(users, eq(users.id, externalResources.attachedBy));

type ResourceRow = Awaited<ReturnType<typeof selectResources>>[number];

function resourceProblem(r: Pick<ResourceRow, "connectionId" | "syncError">): IntegrationErrorCode | null {
  if (r.connectionId === null) return "disconnected";
  return isIntegrationErrorCode(r.syncError) ? r.syncError : null;
}

/** Vrai si la ressource mérite d'être resynchronisée (cache ancien ou dernière tentative en erreur). */
function isStale(r: ResourceRow, now: number): boolean {
  return r.connectionId !== null && (r.syncError !== null || !r.syncedAt || now - r.syncedAt.getTime() > RESOURCE_TTL_MS);
}

function toResourceView(r: ResourceRow): ResourceView {
  return {
    id: r.id,
    projectId: r.projectId,
    provider: r.provider,
    kind: r.kind,
    externalId: r.externalId,
    title: r.title,
    url: r.url,
    updatedLabel: r.externalUpdatedAt ? formatDateTime(r.externalUpdatedAt.toISOString()) : null,
    problem: resourceProblem(r),
    attachedByName: r.attachedByName,
  };
}

/**
 * Ressources rattachées à un projet. `stale` indique qu'au moins l'une d'elles mérite d'être
 * resynchronisée.
 */
export async function getProjectResources(projectId: string): Promise<{ resources: ResourceView[]; stale: boolean }> {
  const rows = await selectResources()
    .where(eq(externalResources.projectId, projectId))
    .orderBy(asc(externalResources.createdAt));

  const now = Date.now();
  return { resources: rows.map(toResourceView), stale: rows.some((r) => isStale(r, now)) };
}

/** Une ressource d'un projet (page de lecture), avec l'indicateur `stale`. */
export async function getProjectResource(
  projectId: string,
  resourceId: string,
): Promise<{ resource: ResourceView; stale: boolean } | null> {
  const [row] = await selectResources()
    .where(and(eq(externalResources.projectId, projectId), eq(externalResources.id, resourceId)))
    .limit(1);
  return row ? { resource: toResourceView(row), stale: isStale(row, Date.now()) } : null;
}

/** Toutes les ressources rattachées, pour la barre latérale (une seule requête pour tous les projets). */
export async function getResourceLinks(): Promise<ResourceLink[]> {
  const rows = await db
    .select({
      id: externalResources.id,
      projectId: externalResources.projectId,
      externalId: externalResources.externalId,
      title: externalResources.title,
      connectionId: externalResources.connectionId,
      syncError: externalResources.syncError,
    })
    .from(externalResources)
    .orderBy(asc(externalResources.createdAt));
  return rows.map(({ connectionId, syncError, ...r }) => ({ ...r, hasProblem: resourceProblem({ connectionId, syncError }) !== null }));
}

/** Durée (ms) des périodes terminées : `filter` restreint la somme (jour, semaine...). */
const workedMs = (filter?: ReturnType<typeof sql>) =>
  sql<number>`coalesce(sum(extract(epoch from (${workSessions.endedAt} - ${workSessions.startedAt}))) ${
    filter ? sql`filter (where ${filter})` : sql``
  }, 0) * 1000`.mapWith(Number);

/** Jour de démarrage d'une période, dans le fuseau de l'équipe. */
const startedDay = sql`(${workSessions.startedAt} at time zone ${APP_TIMEZONE})::date`;

export async function getWorkSummary(userId: string, today: string): Promise<WorkSummary> {
  const weekStart = addDays(endOfWeekISO(today), -6);
  const [[totals], [running]] = await Promise.all([
    db
      .select({
        todayMs: workedMs(sql`${startedDay} = ${today}::date`),
        weekMs: workedMs(sql`${startedDay} >= ${weekStart}::date`),
        totalMs: workedMs(),
        sessions: sql<number>`count(${workSessions.endedAt})::int`,
      })
      .from(workSessions)
      .where(eq(workSessions.userId, userId)),
    db
      .select({ startedAt: workSessions.startedAt })
      .from(workSessions)
      .where(and(eq(workSessions.userId, userId), isNull(workSessions.endedAt)))
      .limit(1),
  ]);
  return { ...totals, runningSince: running?.startedAt.toISOString() ?? null };
}

/** Dernières périodes de travail d'un membre, la plus récente d'abord. */
export async function getWorkSessions(userId: string, limit = 20): Promise<WorkSessionView[]> {
  const rows = await db
    .select({
      id: workSessions.id,
      startedAt: workSessions.startedAt,
      endedAt: workSessions.endedAt,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(workSessions)
    .leftJoin(projects, eq(projects.id, workSessions.projectId))
    .where(eq(workSessions.userId, userId))
    .orderBy(desc(workSessions.startedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, startedAt: r.startedAt.toISOString(), endedAt: r.endedAt?.toISOString() ?? null }));
}

/** Temps de travail d'un membre réparti par projet, du plus long au plus court. */
export async function getWorkByProject(userId: string): Promise<ProjectTime[]> {
  const ms = workedMs();
  return db
    .select({ projectId: workSessions.projectId, name: projects.name, color: projects.color, ms })
    .from(workSessions)
    .leftJoin(projects, eq(projects.id, workSessions.projectId))
    .where(eq(workSessions.userId, userId))
    .groupBy(workSessions.projectId, projects.name, projects.color)
    .orderBy(desc(ms));
}
