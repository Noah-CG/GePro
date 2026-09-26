import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { googleCalendarSyncs, projectEvents, projects, taskAssignees, tasks } from "@/db/schema";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { mockGoogleCalendar, type FakeGoogleCalendar } from "@/test/google-calendar";
import { googleEventId } from "./calendar-events";
import {
  getCalendarSyncView,
  reconcileCalendar,
  saveCalendarSyncSettings,
  scheduleCalendarSync,
  stopCalendarSync,
  syncCalendarItems,
} from "./calendar-sync";
import { saveGoogleConnection } from "./connections";
import { CALENDAR_SCOPE, GOOGLE_SCOPE } from "./google";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
// after() n'existe que pendant une requête Next : ici, le travail part tout de suite.
const scheduled: Promise<unknown>[] = [];
vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => scheduled.push(work()) }));

let me: { id: string };
let other: { id: string };
let chosen: { id: string };
let google: FakeGoogleCalendar;

async function connect(userId: string, scope = `${GOOGLE_SCOPE} ${CALENDAR_SCOPE}`) {
  await saveGoogleConnection(
    userId,
    { accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3_600_000), scope },
    { id: `compte-${userId}`, email: "camille@gmail.com" },
  );
}

async function insertEvent(title: string, projectId: string, eventDate = "2026-09-30") {
  const [row] = await db.insert(projectEvents).values({ title, projectId, eventDate }).returning();
  return row;
}

async function insertTask(title: string, projectId: string, { assignee, status = "todo", dueDate = "2026-10-02" }: { assignee?: string; status?: "todo" | "done"; dueDate?: string | null } = {}) {
  const [row] = await db.insert(tasks).values({ title, projectId, status, dueDate }).returning();
  if (assignee) await db.insert(taskAssignees).values({ taskId: row.id, userId: assignee });
  return row;
}

const calendarId = async () => (await db.select().from(googleCalendarSyncs).where(eq(googleCalendarSyncs.userId, me.id)))[0].calendarId!;
const summaries = async () => google.events(await calendarId()).map((e) => e.summary).sort();

beforeEach(async () => {
  await resetDb(db);
  scheduled.length = 0;
  me = await insertUser(db, "Camille Martin");
  other = await insertUser(db, "Léa Dubois");
  chosen = await insertProject(db, "Refonte du site", me.id);
  const ignored = await insertProject(db, "Autre projet", me.id);
  const archived = await insertProject(db, "Projet archivé", me.id);
  await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, archived.id));

  await insertEvent("Séminaire d'équipe", chosen.id);
  await insertEvent("Réunion client", chosen.id);
  await insertEvent("Hors sélection", ignored.id);
  await insertEvent("Dans un projet archivé", archived.id);
  await insertTask("Ma tâche", chosen.id, { assignee: me.id });
  await insertTask("Tâche de Léa", chosen.id, { assignee: other.id });
  await insertTask("Tâche terminée", chosen.id, { assignee: me.id, status: "done" });
  await insertTask("Sans échéance", chosen.id, { assignee: me.id, dueDate: null });

  google = mockGoogleCalendar();
  await connect(me.id);
  await saveCalendarSyncSettings(me.id, { tasksMode: "mine", projectIds: [chosen.id, archived.id] });
});

describe("synchronisation complète", () => {
  it("crée l'agenda GePro et y met les événements des projets choisis et mes échéances", async () => {
    expect(await reconcileCalendar(me.id)).toEqual({ upserted: 3, deleted: 0, total: 3 });
    expect(google.calls[0]).toMatchObject({ method: "POST", path: "/calendars", body: { summary: "GePro", timeZone: "Europe/Paris" } });
    expect(await summaries()).toEqual(["Réunion client", "Séminaire d'équipe", "Échéance : Ma tâche"]);

    const view = await getCalendarSyncView(me.id);
    expect(view.sync).toMatchObject({ tasksMode: "mine", lastError: null });
    expect(view.sync?.lastSyncedAt).not.toBeNull();
  });

  it("ne réécrit rien quand l'agenda est à jour", async () => {
    await reconcileCalendar(me.id);
    const before = google.calls.length;
    expect(await reconcileCalendar(me.id)).toEqual({ upserted: 0, deleted: 0, total: 3 });
    // Une seule lecture de la liste, aucune écriture.
    expect(google.calls.slice(before).map((c) => c.method)).toEqual(["GET"]);
  });

  it("toutes les échéances des projets choisis, ou aucune", async () => {
    await saveCalendarSyncSettings(me.id, { tasksMode: "all", projectIds: [chosen.id] });
    await reconcileCalendar(me.id);
    expect(await summaries()).toContain("Échéance : Tâche de Léa");

    await saveCalendarSyncSettings(me.id, { tasksMode: "none", projectIds: [chosen.id] });
    await reconcileCalendar(me.id);
    expect(await summaries()).toEqual(["Réunion client", "Séminaire d'équipe"]);
  });

  it("retire les éléments des projets décochés, sans toucher aux événements ajoutés à la main", async () => {
    await reconcileCalendar(me.id);
    const id = await calendarId();
    google.calendars.get(id)!.set("ajoutmain", { id: "ajoutmain", status: "confirmed", summary: "Perso" });

    await saveCalendarSyncSettings(me.id, { tasksMode: "mine", projectIds: [] });
    await reconcileCalendar(me.id);
    expect(google.events(id).map((e) => e.summary).sort()).toEqual(["Perso"]);
  });

  it("recrée l'agenda supprimé dans Google", async () => {
    await reconcileCalendar(me.id);
    const first = await calendarId();
    google.calendars.delete(first);

    await reconcileCalendar(me.id);
    expect(await calendarId()).not.toBe(first);
    expect(await summaries()).toHaveLength(3);
  });

  it("sans le droit Agenda, rien n'est synchronisé", async () => {
    await connect(me.id, GOOGLE_SCOPE);
    await expect(reconcileCalendar(me.id)).rejects.toThrow();
    expect(google.calls).toHaveLength(0);
    expect((await getCalendarSyncView(me.id)).account?.hasCalendarScope).toBe(false);
  });
});

describe("au fil des modifications", () => {
  beforeEach(() => reconcileCalendar(me.id));

  it("met à jour un événement modifié", async () => {
    const [event] = await db.select().from(projectEvents).where(eq(projectEvents.title, "Réunion client"));
    await db.update(projectEvents).set({ title: "Réunion déplacée", eventDate: "2026-10-05" }).where(eq(projectEvents.id, event.id));
    await syncCalendarItems([{ kind: "event", id: event.id }]);

    const stored = google.calendars.get(await calendarId())!.get(googleEventId({ kind: "event", id: event.id }))!;
    expect(stored).toMatchObject({ summary: "Réunion déplacée", start: { date: "2026-10-05" }, end: { date: "2026-10-06" } });
  });

  it("retire une tâche terminée, puis la remet si elle est rouverte", async () => {
    const [task] = await db.select().from(tasks).where(eq(tasks.title, "Ma tâche"));
    await db.update(tasks).set({ status: "done" }).where(eq(tasks.id, task.id));
    await syncCalendarItems([{ kind: "task", id: task.id }]);
    expect(await summaries()).not.toContain("Échéance : Ma tâche");

    // Google garde l'id d'un événement supprimé : la création répond 409, la mise à jour le rétablit.
    await db.update(tasks).set({ status: "todo" }).where(eq(tasks.id, task.id));
    await syncCalendarItems([{ kind: "task", id: task.id }]);
    expect(await summaries()).toContain("Échéance : Ma tâche");
  });

  it("retire un événement supprimé", async () => {
    const event = await insertEvent("Éphémère", chosen.id);
    await syncCalendarItems([{ kind: "event", id: event.id }]);
    expect(await summaries()).toContain("Éphémère");

    await db.delete(projectEvents).where(eq(projectEvents.id, event.id));
    await syncCalendarItems([{ kind: "event", id: event.id }]);
    expect(await summaries()).not.toContain("Éphémère");
  });

  it("n'écrit que dans l'agenda des membres concernés", async () => {
    await connect(other.id);
    await saveCalendarSyncSettings(other.id, { tasksMode: "mine", projectIds: [] });
    await reconcileCalendar(other.id);
    const [task] = await db.select().from(tasks).where(eq(tasks.title, "Ma tâche"));
    const before = google.calls.length;

    await syncCalendarItems([{ kind: "task", id: task.id }]);
    const writes = google.calls.slice(before);
    // Chez moi : mise à jour ; chez Léa (projet non choisi) : suppression d'un événement absent, sans effet.
    expect(writes.map((c) => c.method).sort()).toEqual(["DELETE", "PUT"]);
  });
});

describe("déclenchement et arrêt", () => {
  it("rien n'est programmé tant que personne ne synchronise", async () => {
    await stopCalendarSync(me.id, false);
    await scheduleCalendarSync([{ kind: "event", id: "3b08fcaa-91af-45d6-ac57-fb01af8d079c" }]);
    expect(scheduled).toHaveLength(0);
  });

  it("programme la mise à jour après la réponse", async () => {
    await reconcileCalendar(me.id);
    const event = await insertEvent("Nouveau jalon", chosen.id);
    await scheduleCalendarSync([{ kind: "event", id: event.id }]);
    await Promise.all(scheduled);
    expect(await summaries()).toContain("Nouveau jalon");
  });

  it("arrête la synchronisation et supprime l'agenda sur demande", async () => {
    await reconcileCalendar(me.id);
    const id = await calendarId();
    await stopCalendarSync(me.id, true);
    expect(google.calendars.has(id)).toBe(false);
    expect((await getCalendarSyncView(me.id)).sync).toBeNull();
  });
});
