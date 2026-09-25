import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { taskDependencies, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCalendarItems, getTasks } from "@/lib/queries";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { createTask, deleteTask, getTaskOptions, updateTask } from "./tasks";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const me = await insertUser(db);
  projectId = (await insertProject(db)).id;
  vi.mocked(requireUser).mockResolvedValue({ ...me, role: "member" });
});

/** Crée une tâche et renvoie son id (échoue si l'action refuse). */
async function add(title: string, extra: { parentId?: string; dependsOnIds?: string[]; project?: string } = {}) {
  const res = await createTask({ projectId: extra.project ?? projectId, title, ...extra });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

const view = async (id: string) => (await getTasks({ projectId })).find((t) => t.id === id)!;

describe("sous-tâches", () => {
  it("rattache une sous-tâche et compte l'avancement de la parente", async () => {
    const parent = await add("Lancer le site");
    const sub = await add("Rédiger les textes", { parentId: parent });
    await db.update(tasks).set({ status: "done" }).where(eq(tasks.id, sub));
    await add("Choisir les photos", { parentId: parent });

    expect((await view(parent)).subtasks).toEqual({ total: 2, done: 1 });
    expect(await view(sub)).toMatchObject({ parentId: parent, parentTitle: "Lancer le site" });
  });

  it("n'autorise qu'un seul niveau", async () => {
    const parent = await add("Parente");
    const sub = await add("Sous-tâche", { parentId: parent });
    await expect(createTask({ projectId, title: "Petite-fille", parentId: sub })).resolves.toMatchObject({ ok: false });
    // Une tâche qui a des sous-tâches ne peut pas devenir une sous-tâche.
    const other = await add("Autre");
    await expect(updateTask(parent, { projectId, title: "Parente", parentId: other })).resolves.toMatchObject({ ok: false });
  });

  it("refuse une parente d'un autre projet", async () => {
    const otherProject = (await insertProject(db, "Autre projet")).id;
    const foreign = await add("Ailleurs", { project: otherProject });
    await expect(createTask({ projectId, title: "Ici", parentId: foreign })).resolves.toMatchObject({ ok: false });
  });

  it("supprimer la parente supprime ses sous-tâches", async () => {
    const parent = await add("Parente");
    await add("Sous-tâche", { parentId: parent });
    await deleteTask(parent);
    expect(await db.select().from(tasks)).toHaveLength(0);
  });

  it("les sous-tâches suivent leur parente dans un autre projet", async () => {
    const otherProject = (await insertProject(db, "Autre projet")).id;
    const parent = await add("Parente");
    const sub = await add("Sous-tâche", { parentId: parent });
    await updateTask(parent, { projectId: otherProject, title: "Parente" });
    const [row] = await db.select().from(tasks).where(eq(tasks.id, sub));
    expect(row.projectId).toBe(otherProject);
  });
});

describe("dépendances", () => {
  it("une tâche est bloquée tant que ses prérequis ne sont pas terminés", async () => {
    const design = await add("Maquettes");
    const dev = await add("Intégration", { dependsOnIds: [design] });
    expect((await view(dev)).blockers).toEqual([{ id: design, title: "Maquettes" }]);

    await db.update(tasks).set({ status: "done" }).where(eq(tasks.id, design));
    expect(await view(dev)).toMatchObject({ dependsOnIds: [design], blockers: [] });
  });

  it("refuse les cycles, directs ou indirects", async () => {
    const a = await add("A");
    const b = await add("B", { dependsOnIds: [a] });
    const c = await add("C", { dependsOnIds: [b] });
    await expect(updateTask(a, { projectId, title: "A", dependsOnIds: [c] })).resolves.toMatchObject({ ok: false });
    await expect(updateTask(a, { projectId, title: "A", dependsOnIds: [a] })).resolves.toMatchObject({ ok: false });
  });

  it("refuse un prérequis d'un autre projet", async () => {
    const otherProject = (await insertProject(db, "Autre projet")).id;
    const foreign = await add("Ailleurs", { project: otherProject });
    await expect(createTask({ projectId, title: "Ici", dependsOnIds: [foreign] })).resolves.toMatchObject({ ok: false });
  });

  it("changer de projet retire les dépendances devenues inter-projets", async () => {
    const otherProject = (await insertProject(db, "Autre projet")).id;
    const a = await add("A");
    const b = await add("B", { dependsOnIds: [a] });
    await updateTask(a, { projectId: otherProject, title: "A" });
    expect(await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, b))).toHaveLength(0);
  });

  it("le calendrier renvoie aussi parente et dépendances (sinon les enregistrer depuis le calendrier les effacerait)", async () => {
    const parent = await add("Parente");
    const a = await add("A");
    const sub = await add("B", { parentId: parent, dependsOnIds: [a] });
    await db.update(tasks).set({ dueDate: "2026-09-25" }).where(eq(tasks.id, sub));
    const { tasks: items } = await getCalendarItems({ from: "2026-09-01", to: "2026-09-30", projectId });
    expect(items).toEqual([
      expect.objectContaining({ id: sub, parentId: parent, parentTitle: "Parente", dependsOnIds: [a], blockers: [{ id: a, title: "A" }] }),
    ]);
  });

  it("liste les tâches du projet pour les sélecteurs", async () => {
    const parent = await add("Parente");
    await add("Sous-tâche", { parentId: parent });
    expect(await getTaskOptions(projectId)).toEqual([
      { id: parent, title: "Parente", status: "todo", parentId: null },
      expect.objectContaining({ title: "Sous-tâche", parentId: parent }),
    ]);
  });
});
