/**
 * Lectures en base, appelées depuis les Server Components.
 * Les objets renvoyés sont sérialisables (passables tels quels aux composants client).
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { alias } from "drizzle-orm/pg-core";
import {
  externalConnections,
  externalResources,
  projectEvents,
  projectFiles,
  projects,
  taskAssignees,
  taskDependencies,
  tasks,
  users,
  workSessions,
} from "@/db/schema";
import type { IntegrationProvider, TaskPriority, TaskStatus } from "@/db/schema";
import { addDays, APP_TIMEZONE, endOfWeekISO, formatDateTime } from "@/lib/dates";
import { fileTitle, formatFileSize } from "@/lib/files";
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
  /** Début prévu (diagramme de Gantt). */
  startDate: string | null;
  dueDate: string | null;
  position: number;
  /** Ordre parmi les tâches sœurs (arbre de la vue liste). */
  siblingPosition: number;
  assigneeIds: string[];
  /** Tâche parente, si c'est une sous-tâche. */
  parentId: string | null;
  parentTitle: string | null;
  /** Avancement des sous-tâches directes (total 0 = aucune). */
  subtasks: { total: number; done: number };
  /** Tâches à terminer avant celle-ci. */
  dependsOnIds: string[];
  /** Prérequis pas encore terminés : la tâche est bloquée tant que la liste n'est pas vide. */
  blockers: { id: string; title: string }[];
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
  projectId: string | null;
  startedAt: string;
  endedAt: string | null;
  projectName: string | null;
  projectColor: string | null;
  /** Journal de bord ("" si rien n'a été rédigé). */
  note: string;
};

/**
 * Temps de travail d'un membre sur un projet : cumul de la semaine (périodes terminées) et
 * chrono en cours, s'il tourne sur ce projet.
 */
export type MemberWork = { userId: string; weekMs: number; runningSince: string | null };

/** Temps de travail cumulé par projet (null = aucun projet sélectionné au démarrage). */
export type ProjectTime = { projectId: string | null; name: string | null; color: string | null; ms: number };

/** Fichier PDF importé, tel qu'affiché dans la page Documents et la page de lecture. */
export type FileView = {
  id: string;
  projectId: string;
  /** Nom du fichier, extension comprise (téléchargement). */
  name: string;
  /** Nom sans l'extension .pdf. */
  title: string;
  size: number;
  /** « 1,2 Mo ». */
  sizeLabel: string;
  /** "12 oct. 2026 à 14:32", déjà formaté dans le fuseau de l'équipe. */
  uploadedLabel: string;
  uploadedBy: string | null;
  uploadedByName: string | null;
};

/** Fichier tel que listé dans la barre latérale. */
export type FileLink = { id: string; projectId: string; title: string };

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
  const parent = alias(tasks, "parent");
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
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      position: tasks.position,
      siblingPosition: tasks.siblingPosition,
      parentId: tasks.parentId,
      parentTitle: parent.title,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(parent, eq(parent.id, tasks.parentId))
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
  const ids = rows.map((r) => r.id);
  const [links, linksOf] = await Promise.all([
    db
      .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(inArray(taskAssignees.taskId, ids)),
    getTaskLinks(ids),
  ]);

  const byTask = new Map<string, string[]>();
  for (const l of links) byTask.set(l.taskId, [...(byTask.get(l.taskId) ?? []), l.userId]);

  return rows.map((r) => ({ ...r, assigneeIds: byTask.get(r.id) ?? [], ...linksOf(r.id) }));
}

/** Ids de toutes les sous-tâches d'une tâche, à tous les niveaux (sans la tâche elle-même). */
export async function getSubtaskIds(taskId: string): Promise<string[]> {
  const { rows } = await db.execute<{ id: string }>(sql`
    with recursive sub as (
      select id from ${tasks} where parent_id = ${taskId}::uuid
      union
      select t.id from ${tasks} t join sub on t.parent_id = sub.id
    )
    select id from sub
  `);
  return rows.map((r) => r.id);
}

type TaskLinks = Pick<TaskView, "subtasks" | "dependsOnIds" | "blockers">;

/** Sous-tâches et dépendances de plusieurs tâches, en deux requêtes : renvoie une fonction de lecture par id. */
async function getTaskLinks(ids: string[]): Promise<(id: string) => TaskLinks> {
  if (ids.length === 0) return () => ({ subtasks: { total: 0, done: 0 }, dependsOnIds: [], blockers: [] });
  const prerequisite = alias(tasks, "prerequisite");
  const [subtaskCounts, dependencies] = await Promise.all([
    db
      .select({
        parentId: tasks.parentId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      })
      .from(tasks)
      .where(inArray(tasks.parentId, ids))
      .groupBy(tasks.parentId),
    db
      .select({
        taskId: taskDependencies.taskId,
        id: prerequisite.id,
        title: prerequisite.title,
        status: prerequisite.status,
      })
      .from(taskDependencies)
      .innerJoin(prerequisite, eq(prerequisite.id, taskDependencies.dependsOnId))
      .where(inArray(taskDependencies.taskId, ids))
      .orderBy(asc(prerequisite.title)),
  ]);

  const subtasksByParent = new Map(subtaskCounts.map((c) => [c.parentId, { total: c.total, done: c.done }]));
  const depsByTask = new Map<string, typeof dependencies>();
  for (const d of dependencies) depsByTask.set(d.taskId, [...(depsByTask.get(d.taskId) ?? []), d]);

  return (id) => {
    const deps = depsByTask.get(id) ?? [];
    return {
      subtasks: subtasksByParent.get(id) ?? { total: 0, done: 0 },
      dependsOnIds: deps.map((d) => d.id),
      blockers: deps.filter((d) => d.status !== "done").map(({ id, title }) => ({ id, title })),
    };
  };
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

/** Lundi de la semaine en cours. */
const weekStartOf = (today: string) => addDays(endOfWeekISO(today), -6);

export async function getWorkSummary(userId: string, today: string): Promise<WorkSummary> {
  const weekStart = weekStartOf(today);
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

/** Début du chrono en cours d'un membre (ISO), ou null s'il ne tourne pas. Pour la barre latérale. */
export async function getRunningSince(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ startedAt: workSessions.startedAt })
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), isNull(workSessions.endedAt)))
    .limit(1);
  return row?.startedAt.toISOString() ?? null;
}

/** Dernières périodes de travail d'un membre, la plus récente d'abord. */
export async function getWorkSessions(userId: string, limit = 20): Promise<WorkSessionView[]> {
  const rows = await db
    .select({
      id: workSessions.id,
      projectId: workSessions.projectId,
      startedAt: workSessions.startedAt,
      endedAt: workSessions.endedAt,
      note: workSessions.note,
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

/** Temps de l'équipe sur un projet cette semaine, et chronos en cours sur ce projet. */
export async function getProjectTeamWork(projectId: string, today: string): Promise<MemberWork[]> {
  const thisWeek = sql`${startedDay} >= ${weekStartOf(today)}::date`;
  const rows = await db
    .select({
      userId: workSessions.userId,
      weekMs: workedMs(),
      runningSince: sql<Date | null>`max(${workSessions.startedAt}) filter (where ${workSessions.endedAt} is null)`.mapWith(
        workSessions.startedAt,
      ),
    })
    .from(workSessions)
    .where(and(eq(workSessions.projectId, projectId), sql`(${workSessions.endedAt} is null or ${thisWeek})`))
    .groupBy(workSessions.userId);
  return rows.map((r) => ({ ...r, runningSince: r.runningSince?.toISOString() ?? null }));
}

/** Fichiers importés d'un projet (imports terminés seulement), du plus ancien au plus récent. */
export async function getProjectFiles(projectId: string): Promise<FileView[]> {
  const rows = await selectFiles()
    .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.status, "ready")))
    .orderBy(asc(projectFiles.createdAt));
  return rows.map(toFileView);
}

/** Un fichier importé d'un projet (page de lecture). */
export async function getProjectFile(projectId: string, fileId: string): Promise<FileView | null> {
  const [row] = await selectFiles()
    .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.id, fileId), eq(projectFiles.status, "ready")))
    .limit(1);
  return row ? toFileView(row) : null;
}

/** Tous les fichiers importés, pour la barre latérale (une seule requête pour tous les projets). */
export async function getFileLinks(): Promise<FileLink[]> {
  const rows = await db
    .select({ id: projectFiles.id, projectId: projectFiles.projectId, name: projectFiles.name })
    .from(projectFiles)
    .where(eq(projectFiles.status, "ready"))
    .orderBy(asc(projectFiles.createdAt));
  return rows.map(({ name, ...r }) => ({ ...r, title: fileTitle(name) }));
}

const selectFiles = () =>
  db
    .select({
      id: projectFiles.id,
      projectId: projectFiles.projectId,
      name: projectFiles.name,
      size: projectFiles.size,
      createdAt: projectFiles.createdAt,
      uploadedBy: projectFiles.uploadedBy,
      uploadedByName: users.name,
    })
    .from(projectFiles)
    .leftJoin(users, eq(users.id, projectFiles.uploadedBy));

function toFileView({ createdAt, ...r }: Awaited<ReturnType<typeof selectFiles>>[number]): FileView {
  return {
    ...r,
    title: fileTitle(r.name),
    sizeLabel: formatFileSize(r.size),
    uploadedLabel: formatDateTime(createdAt.toISOString()),
  };
}

type CalendarRow = {
  kind: "task" | "event";
  id: string;
  title: string;
  description: string;
  date: string;
  start_date: string | null;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  position: number | null;
  sibling_position: number | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  parent_id: string | null;
  parent_title: string | null;
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
    select 'task' as kind, t.id, t.title, t.description, t.due_date::text as date, t.start_date::text as start_date,
           t.status::text as status, t.priority::text as priority, t.position, t.sibling_position,
           t.project_id, p.name as project_name, p.color as project_color,
           t.parent_id, (select pt.title from ${tasks} pt where pt.id = t.parent_id) as parent_title,
           coalesce((select json_agg(a.user_id) from ${taskAssignees} a where a.task_id = t.id), '[]'::json) as assignee_ids,
           null::text as color, null::uuid as created_by
      from ${tasks} t
      join ${projects} p on p.id = t.project_id
     where t.project_id = ${projectId}::uuid
       and t.due_date between ${from}::date and ${to}::date
    union all
    select 'event', e.id, e.title, e.description, e.event_date::text, null,
           null, null, null, null,
           e.project_id, p.name, p.color,
           null, null,
           null, e.color, e.created_by
      from ${projectEvents} e
      left join ${projects} p on p.id = e.project_id
     where (e.project_id = ${projectId}::uuid or e.project_id is null)
       and e.event_date between ${from}::date and ${to}::date
    order by date, kind, title
  `);

  const linksOf = await getTaskLinks(rows.filter((r) => r.kind === "task").map((r) => r.id));
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
        startDate: r.start_date,
        dueDate: r.date,
        position: Number(r.position),
        siblingPosition: Number(r.sibling_position),
        assigneeIds: jsonArray(r.assignee_ids),
        parentId: r.parent_id,
        parentTitle: r.parent_title,
        ...linksOf(r.id),
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
