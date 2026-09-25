"use server";

import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { taskAssignees, taskDependencies, tasks, type TaskStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createsCycle } from "@/lib/task-links";
import { firstError, isUuid, taskDatesInput, taskInput, type TaskDatesInput, type TaskInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

/** Rafraîchit toutes les pages (tableau de bord, listes, projets) après une modification. */
const refresh = () => revalidatePath("/", "layout");

/** Remplace la liste des responsables d'une tâche. */
async function setAssignees(taskId: string, userIds: string[]) {
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  const unique = [...new Set(userIds)];
  if (unique.length) await db.insert(taskAssignees).values(unique.map((userId) => ({ taskId, userId })));
}

/** Remplace la liste des tâches dont dépend `taskId`. */
async function setDependencies(taskId: string, dependsOnIds: string[]) {
  await db.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId));
  const unique = [...new Set(dependsOnIds)];
  if (unique.length) await db.insert(taskDependencies).values(unique.map((dependsOnId) => ({ taskId, dependsOnId })));
}

/**
 * Vérifie la tâche parente et les dépendances d'une tâche (`id` nul à la création).
 * Règles : même projet, un seul niveau de sous-tâches, pas de cycle de dépendances.
 * Renvoie un message d'erreur, ou null si tout est valable.
 */
async function checkLinks(
  id: string | null,
  projectId: string,
  parentId: string | null,
  dependsOnIds: string[],
): Promise<string | null> {
  if (parentId) {
    if (parentId === id) return "Une tâche ne peut pas être sa propre sous-tâche.";
    const [parent] = await db
      .select({ projectId: tasks.projectId, parentId: tasks.parentId })
      .from(tasks)
      .where(eq(tasks.id, parentId));
    if (!parent) return "Tâche parente introuvable.";
    if (parent.projectId !== projectId) return "La tâche parente doit appartenir au même projet.";
    if (parent.parentId) return "Une sous-tâche ne peut pas avoir elle-même de sous-tâches.";
    if (id) {
      const [child] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentId, id)).limit(1);
      if (child) return "Cette tâche a des sous-tâches : elle ne peut pas devenir une sous-tâche.";
    }
  }

  const deps = [...new Set(dependsOnIds)];
  if (deps.length === 0) return null;
  if (id && deps.includes(id)) return "Une tâche ne peut pas dépendre d'elle-même.";
  const found = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(inArray(tasks.id, deps));
  if (found.length !== deps.length) return "Une des tâches prérequises est introuvable.";
  if (found.some((t) => t.projectId !== projectId)) return "Les tâches prérequises doivent appartenir au même projet.";
  if (id) {
    const edges = await db
      .select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
      .where(eq(tasks.projectId, projectId));
    if (createsCycle(edges, id, deps)) return "Ces dépendances formeraient une boucle : une tâche attendrait indirectement la fin d'elle-même.";
  }
  return null;
}

/** Position en bas d'une colonne (projet + statut). */
async function nextPosition(projectId: string, status: TaskStatus) {
  const [row] = await db
    .select({ max: max(tasks.position) })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
  return (row?.max ?? 0) + 1024;
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { assigneeIds, dependsOnIds, ...data } = parsed.data;
  const invalid = await checkLinks(null, data.projectId, data.parentId, dependsOnIds);
  if (invalid) return fail(invalid);

  const [task] = await db
    .insert(tasks)
    .values({
      ...data,
      position: await nextPosition(data.projectId, data.status),
      completedAt: data.status === "done" ? new Date() : null,
      createdBy: me.id,
    })
    .returning({ id: tasks.id });

  await setAssignees(task.id, assigneeIds);
  await setDependencies(task.id, dependsOnIds);
  refresh();
  return ok({ id: task.id });
}

export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  await requireUser();
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { assigneeIds, dependsOnIds, ...data } = parsed.data;

  const [current] = await db
    .select({ status: tasks.status, projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, id));
  if (!current) return fail("Tâche introuvable.");
  const invalid = await checkLinks(id, data.projectId, data.parentId, dependsOnIds);
  if (invalid) return fail(invalid);

  await db
    .update(tasks)
    .set({
      ...data,
      // On ne touche à completedAt que si le statut change.
      ...(current.status !== data.status && { completedAt: data.status === "done" ? new Date() : null }),
    })
    .where(eq(tasks.id, id));
  await setAssignees(id, assigneeIds);
  await setDependencies(id, dependsOnIds);

  if (current.projectId !== data.projectId) {
    // Les sous-tâches suivent leur parente dans le nouveau projet…
    await db.update(tasks).set({ projectId: data.projectId }).where(eq(tasks.parentId, id));
    // …et les dépendances devenues inter-projets n'ont plus de sens.
    await db.execute(sql`
      delete from ${taskDependencies} d
      using ${tasks} a, ${tasks} b
      where a.id = d.task_id and b.id = d.depends_on_id and a.project_id <> b.project_id
        and (a.id = ${id} or b.id = ${id} or a.parent_id = ${id} or b.parent_id = ${id})
    `);
  }
  refresh();
  return ok(undefined);
}

/**
 * Changement de statut (Kanban, case à cocher, liste).
 * `position` est fourni par le Kanban ; sinon la tâche va en bas de la colonne.
 */
export async function moveTask(id: string, status: TaskStatus, position?: number): Promise<ActionResult> {
  await requireUser();
  const [current] = await db
    .select({ status: tasks.status, projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, id));
  if (!current) return fail("Tâche introuvable.");

  await db
    .update(tasks)
    .set({
      status,
      position: position ?? (await nextPosition(current.projectId, status)),
      ...(current.status !== status && { completedAt: status === "done" ? new Date() : null }),
    })
    .where(eq(tasks.id, id));
  refresh();
  return ok(undefined);
}

/** Nouvelles dates d'une tâche (glisser-déposer ou clavier dans le diagramme de Gantt). */
export async function setTaskDates(id: string, input: TaskDatesInput): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return fail("Tâche introuvable.");
  const parsed = taskDatesInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [row] = await db.update(tasks).set(parsed.data).where(eq(tasks.id, id)).returning({ id: tasks.id });
  if (!row) return fail("Tâche introuvable.");
  refresh();
  return ok(undefined);
}

/** Rattache une tâche à une parente, ou la détache (`parentId` nul) : glisser-déposer de la vue liste. */
export async function setTaskParent(id: string, parentId: string | null): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id) || (parentId !== null && !isUuid(parentId))) return fail("Tâche introuvable.");
  const [current] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, id));
  if (!current) return fail("Tâche introuvable.");
  const invalid = await checkLinks(id, current.projectId, parentId, []);
  if (invalid) return fail(invalid);

  await db.update(tasks).set({ parentId }).where(eq(tasks.id, id));
  refresh();
  return ok(undefined);
}

export async function deleteTask(id: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(tasks).where(eq(tasks.id, id));
  refresh();
  return ok(undefined);
}

/** Tâche proposée comme parente ou comme prérequis dans la fenêtre d'édition. */
export type TaskOption = { id: string; title: string; status: TaskStatus; parentId: string | null };

/** Tâches d'un projet, pour choisir une tâche parente ou des dépendances. */
export async function getTaskOptions(projectId: string): Promise<TaskOption[]> {
  await requireUser();
  if (!isUuid(projectId)) return [];
  return db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, parentId: tasks.parentId })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.title));
}
