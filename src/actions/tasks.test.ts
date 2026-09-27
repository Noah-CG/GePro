import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { taskAssignees, tasks, type TaskStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import { createTask, moveTask, setTaskDates, updateTask } from "./tasks";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let projectId: string;
let meId: string;

const findTask = async (id: string) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0];

async function newTask(dates: { startDate?: string; dueDate?: string } = {}) {
  const res = await createTask({ projectId, title: "Maquettes", ...dates });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

beforeEach(async () => {
  await resetDb(db);
  const user = await insertUser(db);
  meId = user.id;
  vi.mocked(requireUser).mockResolvedValue({ ...user, role: "member" });
  projectId = (await insertProject(db, "Refonte du site", user.id)).id;
});

describe("date de début des tâches", () => {
  it("est enregistrée à la création et à la modification", async () => {
    const id = await newTask({ startDate: "2026-09-21", dueDate: "2026-09-25" });
    expect(await findTask(id)).toMatchObject({ startDate: "2026-09-21", dueDate: "2026-09-25" });

    await updateTask(id, { projectId, title: "Maquettes", startDate: "", dueDate: "2026-09-25" });
    expect(await findTask(id)).toMatchObject({ startDate: null, dueDate: "2026-09-25" });
  });

  it("ne peut pas suivre l'échéance", async () => {
    const res = await createTask({ projectId, title: "Maquettes", startDate: "2026-09-26", dueDate: "2026-09-25" });
    expect(res).toEqual({ ok: false, error: "Le début doit précéder l'échéance" });
  });
});

describe("setTaskDates", () => {
  it("change le début et l'échéance d'une tâche", async () => {
    const id = await newTask({ dueDate: "2026-09-25" });
    expect(await setTaskDates(id, { startDate: "2026-09-28", dueDate: "2026-10-02" })).toEqual({ ok: true, data: undefined });
    expect(await findTask(id)).toMatchObject({ startDate: "2026-09-28", dueDate: "2026-10-02" });
  });

  it("refuse un début après l'échéance", async () => {
    const id = await newTask({ dueDate: "2026-09-25" });
    const res = await setTaskDates(id, { startDate: "2026-10-03", dueDate: "2026-10-02" });
    expect(res).toEqual({ ok: false, error: "Le début doit précéder l'échéance" });
    expect(await findTask(id)).toMatchObject({ startDate: null, dueDate: "2026-09-25" });
  });

  it("répond proprement pour une tâche inconnue ou un identifiant invalide", async () => {
    const dates = { startDate: "2026-09-28", dueDate: "2026-10-02" };
    expect(await setTaskDates("pas-un-uuid", dates)).toEqual({ ok: false, error: "Tâche introuvable." });
    expect(await setTaskDates("00000000-0000-4000-8000-000000000000", dates)).toEqual({ ok: false, error: "Tâche introuvable." });
  });
});

describe("moveTask", () => {
  it("enregistre le passage à « Terminé » (statut, position, date de fin) et le retour", async () => {
    const id = await newTask();
    expect(await moveTask(id, "done", 512)).toEqual({ ok: true, data: undefined });
    const done = await findTask(id);
    expect(done).toMatchObject({ status: "done", position: 512 });
    expect(done.completedAt).toBeInstanceOf(Date);

    expect(await moveTask(id, "todo", 256)).toEqual({ ok: true, data: undefined });
    expect(await findTask(id)).toMatchObject({ status: "todo", position: 256, completedAt: null });
  });

  it("termine une tâche parente sans exiger ses sous-tâches, et une sous-tâche seule", async () => {
    const parentId = await newTask();
    const child = await createTask({ projectId, title: "Sous-tâche", parentId });
    if (!child.ok) throw new Error(child.error);
    expect(await moveTask(parentId, "done")).toMatchObject({ ok: true });
    expect(await moveTask(child.data.id, "done")).toMatchObject({ ok: true });
    expect((await findTask(parentId)).status).toBe("done");
    expect((await findTask(child.data.id)).status).toBe("done");
  });

  it("refuse un statut inconnu avec un message, sans rien modifier", async () => {
    const id = await newTask();
    for (const status of ["terminee", "completed", "Done", ""]) {
      expect(await moveTask(id, status as TaskStatus)).toEqual({ ok: false, error: "Statut de tâche inconnu." });
    }
    expect(await moveTask(id, "done", Number.NaN)).toMatchObject({ ok: false });
    expect((await findTask(id)).status).toBe("todo");
  });
});

describe("validation", () => {
  it("refuse une date qui n'existe pas au lieu d'échouer en base", async () => {
    expect(await createTask({ projectId, title: "Maquettes", dueDate: "2026-02-31" })).toEqual({ ok: false, error: "Date invalide" });
    const id = await newTask();
    expect(await setTaskDates(id, { startDate: null, dueDate: "2026-09-31" })).toEqual({ ok: false, error: "Date invalide" });
  });

  it("moveTask refuse un statut ou une position invalides", async () => {
    const id = await newTask();
    expect(await moveTask(id, "archivee" as never)).toEqual({ ok: false, error: "Statut de tâche inconnu." });
    expect(await moveTask(id, "done", Number.NaN)).toMatchObject({ ok: false });
    expect(await moveTask(id, "done", Number.POSITIVE_INFINITY)).toMatchObject({ ok: false });
    expect(await findTask(id)).toMatchObject({ status: "todo" });
  });
});

describe("responsables", () => {
  it("remplace la liste sans perdre ceux qui restent", async () => {
    const lea = await insertUser(db, "Léa");
    await addMember(db, projectId, lea.id);
    const res = await createTask({ projectId, title: "Maquettes", assigneeIds: [meId, lea.id] });
    if (!res.ok) throw new Error(res.error);
    await updateTask(res.data.id, { projectId, title: "Maquettes", assigneeIds: [lea.id] });
    const rows = await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, res.data.id));
    expect(rows.map((r) => r.userId)).toEqual([lea.id]);
    await updateTask(res.data.id, { projectId, title: "Maquettes", assigneeIds: [] });
    expect(await db.select().from(taskAssignees)).toEqual([]);
  });

  it("une tâche déplacée dans un autre projet perd, avec ses sous-tâches, les responsables qui n'en sont pas membres", async () => {
    const lea = await insertUser(db, "Léa");
    await addMember(db, projectId, lea.id);
    const other = (await insertProject(db, "Autre projet", meId)).id;
    const parent = await createTask({ projectId, title: "Parente", assigneeIds: [meId] });
    if (!parent.ok) throw new Error(parent.error);
    const child = await createTask({ projectId, title: "Enfant", parentId: parent.data.id, assigneeIds: [meId, lea.id] });
    if (!child.ok) throw new Error(child.error);

    expect(await updateTask(parent.data.id, { projectId: other, title: "Parente", assigneeIds: [meId] })).toMatchObject({ ok: true });
    const rows = await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, child.data.id));
    expect(rows.map((r) => r.userId)).toEqual([meId]);
  });
});

describe("positions du Kanban", () => {
  it("renumérote la colonne quand deux cartes n'ont plus d'écart", async () => {
    const a = await newTask();
    const b = await newTask();
    const c = await newTask();
    const positions = async () => Promise.all([a, b, c].map(async (id) => (await findTask(id)).position));
    // Écart suffisant : rien ne bouge.
    await moveTask(c, "todo", 1500);
    expect(await positions()).toEqual([1024, 2048, 1500]);
    // Écart épuisé entre a et c : toute la colonne est renumérotée, dans le même ordre.
    await moveTask(c, "todo", 1024 + 1e-9);
    expect(await positions()).toEqual([1024, 3072, 2048]);
  });
});
