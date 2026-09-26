import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectEvents, taskAssignees, tasks } from "@/db/schema";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { getCalendarItems } from "./queries";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

let projectId: string;
let otherProjectId: string;
let userId: string;

beforeEach(async () => {
  await resetDb(db);
  userId = (await insertUser(db, "Camille Martin")).id;
  projectId = (await insertProject(db, "Refonte", userId)).id;
  otherProjectId = (await insertProject(db, "Autre projet", userId)).id;
});

const addTask = async (title: string, dueDate: string | null, project = projectId) =>
  (await db.insert(tasks).values({ projectId: project, title, dueDate }).returning())[0];

const addEvent = async (title: string, eventDate: string, project = projectId) =>
  (await db.insert(projectEvents).values({ projectId: project, title, eventDate, color: "#f43f5e", createdBy: userId }).returning())[0];

const range = { from: "2026-09-28", to: "2026-10-04" };

describe("getCalendarItems", () => {
  it("renvoie les tâches et les événements de l'intervalle, bornes comprises", async () => {
    await addTask("Avant", "2026-09-27");
    await addTask("Premier jour", "2026-09-28");
    await addTask("Dernier jour", "2026-10-04");
    await addTask("Après", "2026-10-05");
    await addTask("Sans échéance", null);
    await addEvent("Comité", "2026-10-01");
    await addEvent("Hors intervalle", "2026-10-10");

    const { tasks: t, events: e } = await getCalendarItems({ ...range, projectId });
    expect(t.map((x) => x.title)).toEqual(["Premier jour", "Dernier jour"]);
    expect(e.map((x) => x.title)).toEqual(["Comité"]);
  });

  it("se limite au projet demandé : rien d'un autre projet", async () => {
    await addTask("Autre projet", "2026-09-30", otherProjectId);
    await addEvent("Autre projet", "2026-09-30", otherProjectId);

    const { tasks: t, events: e } = await getCalendarItems({ ...range, projectId });
    expect(t).toEqual([]);
    expect(e).toEqual([]);
  });

  it("renvoie des tâches au format TaskView, dates \"YYYY-MM-DD\" et responsables compris", async () => {
    const task = await addTask("Maquettes", "2026-09-29");
    await db.update(tasks).set({ startDate: "2026-09-21" }).where(eq(tasks.id, task.id));
    const lea = await insertUser(db, "Léa Dubois");
    await db.insert(taskAssignees).values([
      { taskId: task.id, userId },
      { taskId: task.id, userId: lea.id },
    ]);

    const [t] = (await getCalendarItems({ ...range, projectId })).tasks;
    expect(t).toMatchObject({
      id: task.id,
      projectId,
      projectName: "Refonte",
      title: "Maquettes",
      status: "todo",
      priority: "medium",
      startDate: "2026-09-21",
      dueDate: "2026-09-29",
      position: 0,
    });
    expect(t.assigneeIds.sort()).toEqual([userId, lea.id].sort());
  });

  it("renvoie des événements complets, triés par jour puis par titre", async () => {
    await addEvent("Revue", "2026-10-02");
    await addEvent("Atelier", "2026-10-02");
    await addEvent("Lancement", "2026-09-28");

    const { events } = await getCalendarItems({ ...range, projectId });
    expect(events.map((e) => `${e.date} ${e.title}`)).toEqual(["2026-09-28 Lancement", "2026-10-02 Atelier", "2026-10-02 Revue"]);
    expect(events[0]).toMatchObject({ projectId, projectName: "Refonte", color: "#f43f5e", createdBy: userId, description: "" });
  });
});
