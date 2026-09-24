/**
 * Lectures en base, appelées depuis les Server Components.
 * Les objets renvoyés sont sérialisables (passables tels quels aux composants client).
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalConnections, externalResources, projectEvents, projects, taskAssignees, tasks, users } from "@/db/schema";
import type { IntegrationProvider, TaskPriority, TaskStatus } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
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

/** Événement du calendrier, tel qu'affiché. */
export type CalendarEvent = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  title: string;
  description: string;
  /** "YYYY-MM-DD". */
  date: string;
  color: string;
  createdBy: string | null;
};

/** Contenu d'une vue du calendrier : tâches (par échéance) et événements, triés par jour. */
export type CalendarItems = { tasks: TaskView[]; events: CalendarEvent[] };

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

type CalendarRow = {
  kind: "task" | "event";
  id: string;
  title: string;
  description: string;
  date: string;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  position: number | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  assignee_ids: unknown;
  color: string | null;
  created_by: string | null;
};

/** Tableau JSON renvoyé par Postgres : déjà décodé par le pilote, ou encore sous forme de texte. */
const jsonArray = (value: unknown): string[] =>
  Array.isArray(value) ? value : typeof value === "string" ? (JSON.parse(value) as string[]) : [];

/**
 * Tâches (par échéance) et événements entre `from` et `to` inclus ("YYYY-MM-DD"), pour le projet
 * sélectionné ; les événements sans projet (équipe) sont toujours inclus.
 *
 * Une seule requête, bornée sur l'intervalle affiché : UNION ALL des deux sources, responsables
 * agrégés en JSON. Dates et énumérations sont converties en texte côté SQL pour que Neon et
 * PGlite renvoient exactement les mêmes valeurs (dates "YYYY-MM-DD", convention du projet).
 */
export async function getCalendarItems({
  from,
  to,
  projectId,
}: {
  from: string;
  to: string;
  projectId: string | null;
}): Promise<CalendarItems> {
  const { rows } = await db.execute<CalendarRow>(sql`
    select 'task' as kind, t.id, t.title, t.description, t.due_date::text as date,
           t.status::text as status, t.priority::text as priority, t.position,
           t.project_id, p.name as project_name, p.color as project_color,
           coalesce((select json_agg(a.user_id) from ${taskAssignees} a where a.task_id = t.id), '[]'::json) as assignee_ids,
           null::text as color, null::uuid as created_by
      from ${tasks} t
      join ${projects} p on p.id = t.project_id
     where t.project_id = ${projectId}::uuid
       and t.due_date between ${from}::date and ${to}::date
    union all
    select 'event', e.id, e.title, e.description, e.event_date::text,
           null, null, null,
           e.project_id, p.name, p.color,
           null, e.color, e.created_by
      from ${projectEvents} e
      left join ${projects} p on p.id = e.project_id
     where (e.project_id = ${projectId}::uuid or e.project_id is null)
       and e.event_date between ${from}::date and ${to}::date
    order by date, kind, title
  `);

  const result: CalendarItems = { tasks: [], events: [] };
  for (const r of rows) {
    if (r.kind === "task") {
      result.tasks.push({
        id: r.id,
        projectId: r.project_id!,
        projectName: r.project_name!,
        projectColor: r.project_color!,
        title: r.title,
        description: r.description,
        status: r.status!,
        priority: r.priority!,
        dueDate: r.date,
        position: Number(r.position),
        assigneeIds: jsonArray(r.assignee_ids),
      });
    } else {
      result.events.push({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name,
        projectColor: r.project_color,
        title: r.title,
        description: r.description,
        date: r.date,
        color: r.color!,
        createdBy: r.created_by,
      });
    }
  }
  return result;
}
