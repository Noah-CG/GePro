/**
 * Synchronisation GePro → Google Agenda.
 *
 * Chaque membre qui l'active reçoit dans son compte Google un agenda « GePro », créé par l'app :
 * événements d'équipe, événements des projets choisis et, selon son réglage, échéances des
 * tâches non terminées de ces projets. Sens unique : GePro est la référence.
 *
 * - Au fil de l'eau : après chaque modification d'un événement ou d'une tâche, `after()` met à
 *   jour les éléments concernés dans l'agenda de chaque membre synchronisé, sans ralentir l'action.
 * - Synchronisation complète : à l'activation, au changement de réglages, sur demande et au plus
 *   toutes les 6 h à l'ouverture du calendrier. Elle compare l'agenda à ce qu'il devrait contenir
 *   (empreinte de chaque événement) et rattrape tout écart : modification manquée, agenda
 *   supprimé dans Google, projet archivé ou renommé…
 */
import "server-only";
import { and, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import {
  externalConnections,
  googleCalendarSyncProjects,
  googleCalendarSyncs,
  projectEvents,
  projects,
  taskAssignees,
  tasks,
  type CalendarTasksMode,
  type ExternalConnection,
  type GoogleCalendarSync,
} from "@/db/schema";
import { APP_TIMEZONE } from "@/lib/dates";
import { getSubtaskIds, memberProjectIds } from "@/lib/queries";
import { isUuid } from "@/lib/validation";
import { withGoogleAccess } from "./connections";
import { diffCalendar, googleEventId, toCalendarEvent, type CalendarItem, type CalendarSource } from "./calendar-events";
import { reportIntegrationError, type IntegrationErrorCode } from "./errors";
import { hasCalendarScope, isGoogleConfigured } from "./google";
import { createCalendar, deleteCalendar, deleteEvent, isCalendarGone, listEvents, upsertEvent, type ExistingEvent } from "./google-calendar";

export type { CalendarSource } from "./calendar-events";

/** Synchronisation complète automatique à l'ouverture du calendrier, au plus toutes les 6 h. */
const STALE_AFTER_MS = 6 * 3_600_000;
/** Appels Google menés en parallèle : assez pour aller vite, sans heurter les quotas par utilisateur. */
const CONCURRENCY = 4;

const appUrl = () => process.env.APP_URL?.trim().replace(/\/+$/, "") || null;

type SyncSettings = { tasksMode: CalendarTasksMode; projectIds: string[] };
type ActiveSync = GoogleCalendarSync & { connection: ExternalConnection };

// Lecture

/** État affiché dans la fenêtre « Google Agenda » du calendrier. */
export type CalendarSyncView = {
  configured: boolean;
  /** Compte Google connecté : null si aucun ; sinon état de la connexion et droit Agenda. */
  account: { email: string; status: "active" | "needs_reauth"; hasCalendarScope: boolean } | null;
  /** Réglages enregistrés : null si la synchronisation n'est pas activée. */
  sync: (SyncSettings & { lastSyncedAt: string | null; lastError: IntegrationErrorCode | null }) | null;
};

export async function getCalendarSyncView(userId: string): Promise<CalendarSyncView> {
  const [[connection], [sync], selected] = await Promise.all([
    db
      .select({ email: externalConnections.accountEmail, status: externalConnections.status, scopes: externalConnections.scopes })
      .from(externalConnections)
      .where(and(eq(externalConnections.userId, userId), eq(externalConnections.provider, "google"))),
    db.select().from(googleCalendarSyncs).where(eq(googleCalendarSyncs.userId, userId)),
    db.select({ id: googleCalendarSyncProjects.projectId }).from(googleCalendarSyncProjects).where(eq(googleCalendarSyncProjects.userId, userId)),
  ]);
  return {
    configured: isGoogleConfigured(),
    account: connection
      ? { email: connection.email, status: connection.status, hasCalendarScope: hasCalendarScope(connection.scopes) }
      : null,
    sync: sync
      ? {
          tasksMode: sync.tasksMode,
          projectIds: selected.map((p) => p.id),
          lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
          lastError: (sync.lastError as IntegrationErrorCode | null) ?? null,
        }
      : null,
  };
}

/** Synchronisations utilisables (connexion Google active avec le droit Agenda), toutes ou celle d'un membre. */
async function activeSyncs(userIds?: string[]): Promise<ActiveSync[]> {
  if (userIds?.length === 0) return [];
  const rows = await db
    .select({ sync: googleCalendarSyncs, connection: externalConnections })
    .from(googleCalendarSyncs)
    .innerJoin(
      externalConnections,
      and(eq(externalConnections.userId, googleCalendarSyncs.userId), eq(externalConnections.provider, "google")),
    )
    .where(and(eq(externalConnections.status, "active"), userIds ? inArray(googleCalendarSyncs.userId, userIds) : undefined));
  return rows.filter((r) => hasCalendarScope(r.connection.scopes)).map((r) => ({ ...r.sync, connection: r.connection }));
}

async function settingsOf(userId: string, tasksMode: CalendarTasksMode): Promise<SyncSettings> {
  const rows = await db
    .select({ id: googleCalendarSyncProjects.projectId })
    .from(googleCalendarSyncProjects)
    .where(eq(googleCalendarSyncProjects.userId, userId));
  return { tasksMode, projectIds: rows.map((r) => r.id) };
}

/**
 * Éléments GePro attendus dans l'agenda d'un membre, éventuellement restreints à certains ids.
 * Seulement les projets choisis dont il est (encore) membre ; projets archivés exclus ; tâches
 * terminées ou sans échéance exclues.
 */
export async function desiredItems(
  userId: string,
  { tasksMode, projectIds }: SyncSettings,
  only?: { eventIds: string[]; taskIds: string[] },
): Promise<CalendarItem[]> {
  const activeProject = (column: typeof projectEvents.projectId | typeof tasks.projectId): SQL =>
    projectIds.length
      ? and(inArray(column, projectIds), inArray(column, memberProjectIds(userId)), isNull(projects.archivedAt))!
      : sql`false`;

  const wantEvents = projectIds.length > 0 && (!only || only.eventIds.length > 0);
  const wantTasks = tasksMode !== "none" && projectIds.length > 0 && (!only || only.taskIds.length > 0);

  const [eventRows, taskRows] = await Promise.all([
    wantEvents
      ? db
          .select({
            id: projectEvents.id,
            title: projectEvents.title,
            description: projectEvents.description,
            date: projectEvents.eventDate,
            color: projectEvents.color,
            projectId: projectEvents.projectId,
            projectName: projects.name,
          })
          .from(projectEvents)
          .innerJoin(projects, eq(projects.id, projectEvents.projectId))
          .where(and(activeProject(projectEvents.projectId), only ? inArray(projectEvents.id, only.eventIds) : undefined))
      : [],
    wantTasks
      ? db
          .select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            date: tasks.dueDate,
            projectId: tasks.projectId,
            projectName: projects.name,
            projectColor: projects.color,
          })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(
            and(
              activeProject(tasks.projectId),
              ne(tasks.status, "done"),
              sql`${tasks.dueDate} is not null`,
              tasksMode === "mine"
                ? sql`exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id} and ${taskAssignees.userId} = ${userId})`
                : undefined,
              only ? inArray(tasks.id, only.taskIds) : undefined,
            ),
          )
      : [],
  ]);

  return [
    ...eventRows.map((e): CalendarItem => ({ kind: "event", ...e })),
    ...taskRows.map((t): CalendarItem => ({ kind: "task", ...t, date: t.date! })),
  ];
}

// Écriture

/** Exécute `work` sur chaque élément, `CONCURRENCY` à la fois. */
async function pool<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  });
  await Promise.all(workers);
}

async function recordResult(userId: string, error: unknown | null, full: boolean) {
  await db
    .update(googleCalendarSyncs)
    .set({
      lastError: error === null ? null : reportIntegrationError(error),
      ...(full && error === null ? { lastSyncedAt: new Date() } : {}),
    })
    .where(eq(googleCalendarSyncs.userId, userId));
}

/** Agenda « GePro » du membre : celui enregistré, ou un nouveau (premier passage, ou supprimé dans Google). */
async function ensureCalendar(sync: ActiveSync, token: string, recreate = false): Promise<string> {
  if (sync.calendarId && !recreate) return sync.calendarId;
  const calendarId = await createCalendar(token, APP_TIMEZONE);
  await db.update(googleCalendarSyncs).set({ calendarId }).where(eq(googleCalendarSyncs.userId, sync.userId));
  sync.calendarId = calendarId;
  return calendarId;
}

export type SyncReport = { upserted: number; deleted: number; total: number };

/** Synchronisation complète de l'agenda d'un membre. Lève une IntegrationError en cas d'échec (aussi enregistrée). */
export async function reconcileCalendar(userId: string): Promise<SyncReport> {
  const [sync] = await activeSyncs([userId]);
  if (!sync) throw new Error("synchronisation inactive");
  try {
    const report = await withGoogleAccess(sync.connection, async (token) => {
      let calendarId = await ensureCalendar(sync, token);
      let existing: ExistingEvent[];
      try {
        existing = await listEvents(token, calendarId);
      } catch (e) {
        if (!isCalendarGone(e)) throw e;
        calendarId = await ensureCalendar(sync, token, true);
        existing = [];
      }
      const url = appUrl();
      const desired = (await desiredItems(userId, await settingsOf(userId, sync.tasksMode))).map((item) => toCalendarEvent(item, url));
      const { upserts, deletes } = diffCalendar(desired, existing);
      await pool(upserts, (event) => upsertEvent(token, calendarId, event));
      await pool(deletes, (id) => deleteEvent(token, calendarId, id));
      return { upserted: upserts.length, deleted: deletes.length, total: desired.length };
    });
    await recordResult(userId, null, true);
    return report;
  } catch (e) {
    await recordResult(userId, e, true);
    throw e;
  }
}

/**
 * Met à jour quelques éléments dans l'agenda de chaque membre synchronisé : créés ou modifiés
 * s'ils y sont attendus, retirés sinon (supprimés, terminés, projet non choisi…).
 */
export async function syncCalendarItems(sources: CalendarSource[]): Promise<void> {
  if (sources.length === 0) return;
  const only = {
    eventIds: sources.filter((s) => s.kind === "event").map((s) => s.id),
    taskIds: sources.filter((s) => s.kind === "task").map((s) => s.id),
  };
  const url = appUrl();
  for (const sync of await activeSyncs()) {
    try {
      // Agenda pas encore créé : la synchronisation complète s'en charge.
      if (!sync.calendarId) {
        await reconcileCalendar(sync.userId);
        continue;
      }
      const calendarId = sync.calendarId;
      const desired = new Map(
        (await desiredItems(sync.userId, await settingsOf(sync.userId, sync.tasksMode), only)).map((item) => {
          const event = toCalendarEvent(item, url);
          return [event.id, event];
        }),
      );
      await withGoogleAccess(sync.connection, (token) =>
        pool(sources, async (source) => {
          const id = googleEventId(source);
          const event = desired.get(id);
          if (event) await upsertEvent(token, calendarId, event);
          else await deleteEvent(token, calendarId, id);
        }),
      );
      if (sync.lastError) await recordResult(sync.userId, null, false);
    } catch (e) {
      // Agenda supprimé dans Google : on le recrée et on le remplit entièrement.
      if (isCalendarGone(e)) await reconcileCalendar(sync.userId).catch(() => {});
      else await recordResult(sync.userId, e, false);
    }
  }
}

// Déclenchement

/** Au moins un membre synchronise son agenda (sinon, rien à faire après une modification). */
async function anySync(): Promise<boolean> {
  const [row] = await db.select({ userId: googleCalendarSyncs.userId }).from(googleCalendarSyncs).limit(1);
  return !!row;
}

/** Lance `work` après la réponse, sans jamais faire échouer la requête. */
function runAfter(work: () => Promise<unknown>) {
  after(async () => {
    try {
      await work();
    } catch (e) {
      console.error("[agenda]", e);
    }
  });
}

/**
 * À appeler dans une Server Action qui modifie des événements ou des tâches : les éléments
 * seront mis à jour dans les agendas Google après la réponse. `sources` peut être une fonction,
 * pour ne lire la base (ids des sous-tâches…) que si une synchronisation existe. Pour une
 * suppression, l'appeler avant de supprimer.
 */
export async function scheduleCalendarSync(sources: CalendarSource[] | (() => Promise<CalendarSource[]>)): Promise<void> {
  if (!(await anySync())) return;
  const list = typeof sources === "function" ? await sources() : sources;
  if (list.length) runAfter(() => syncCalendarItems(list));
}

/** Synchronisation complète, après la réponse, des agendas de ces membres (projet supprimé, membre retiré…). */
export async function scheduleReconcile(userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const syncing = await db
    .select({ userId: googleCalendarSyncs.userId })
    .from(googleCalendarSyncs)
    .where(inArray(googleCalendarSyncs.userId, unique));
  if (syncing.length) runAfter(async () => {
    for (const { userId } of syncing) await reconcileCalendar(userId).catch(() => {});
  });
}

/** Membres qui ont choisi ce projet pour leur agenda Google. */
export async function calendarSyncUsersOf(projectId: string): Promise<string[]> {
  if (!isUuid(projectId) || !(await anySync())) return [];
  const rows = await db
    .select({ userId: googleCalendarSyncProjects.userId })
    .from(googleCalendarSyncProjects)
    .where(eq(googleCalendarSyncProjects.projectId, projectId));
  return rows.map((r) => r.userId);
}

/** Projet modifié (nom, couleur, archivage) : synchronisation complète des membres qui l'ont choisi. */
export async function scheduleProjectCalendarSync(projectId: string): Promise<void> {
  await scheduleReconcile(await calendarSyncUsersOf(projectId));
}

/** Ouverture du calendrier : synchronisation complète en arrière-plan si la dernière date de plus de 6 h. */
export async function reconcileIfStale(userId: string): Promise<void> {
  const [sync] = await db
    .select({ lastSyncedAt: googleCalendarSyncs.lastSyncedAt })
    .from(googleCalendarSyncs)
    .where(eq(googleCalendarSyncs.userId, userId));
  if (!sync || (sync.lastSyncedAt && Date.now() - sync.lastSyncedAt.getTime() < STALE_AFTER_MS)) return;
  runAfter(() => reconcileCalendar(userId));
}

/** Une tâche et ses sous-tâches (à tous les niveaux) : elles changent de projet ou disparaissent avec elle. */
export async function taskWithSubtasks(taskId: string): Promise<CalendarSource[]> {
  if (!isUuid(taskId)) return [];
  return [taskId, ...(await getSubtaskIds(taskId))].map((id) => ({ kind: "task", id }));
}

// Réglages

/** Active la synchronisation ou change ses réglages. La synchronisation complète est à lancer ensuite. */
export async function saveCalendarSyncSettings(userId: string, settings: SyncSettings): Promise<void> {
  await db
    .insert(googleCalendarSyncs)
    .values({ userId, tasksMode: settings.tasksMode })
    .onConflictDoUpdate({ target: googleCalendarSyncs.userId, set: { tasksMode: settings.tasksMode, updatedAt: new Date() } });
  // Pas de transaction avec le driver HTTP de Neon : on remplace la liste en deux temps.
  await db.delete(googleCalendarSyncProjects).where(eq(googleCalendarSyncProjects.userId, userId));
  if (settings.projectIds.length) {
    await db.insert(googleCalendarSyncProjects).values(settings.projectIds.map((projectId) => ({ userId, projectId })));
  }
}

/** Arrête la synchronisation ; `removeCalendar` : supprime aussi l'agenda « GePro » dans Google. */
export async function stopCalendarSync(userId: string, removeCalendar: boolean): Promise<void> {
  const [sync] = await activeSyncs([userId]);
  if (removeCalendar && sync?.calendarId) {
    const calendarId = sync.calendarId;
    await withGoogleAccess(sync.connection, (token) => deleteCalendar(token, calendarId));
  }
  await db.delete(googleCalendarSyncs).where(eq(googleCalendarSyncs.userId, userId));
}

