import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { createTask, setTaskDates, updateTask } from "./tasks";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let projectId: string;

const findTask = async (id: string) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0];

async function newTask(dates: { startDate?: string; dueDate?: string } = {}) {
  const res = await createTask({ projectId, title: "Maquettes", ...dates });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

beforeEach(async () => {
  await resetDb(db);
  const user = await insertUser(db);
  vi.mocked(requireUser).mockResolvedValue({ ...user, role: "member" });
  projectId = (await insertProject(db)).id;
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
