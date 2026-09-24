"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { taskAssignees, tasks, type TaskStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
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
  const { assigneeIds, ...data } = parsed.data;

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
  refresh();
  return ok({ id: task.id });
}

export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  await requireUser();
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { assigneeIds, ...data } = parsed.data;

  const [current] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, id));
  if (!current) return fail("Tâche introuvable.");

  await db
    .update(tasks)
    .set({
      ...data,
      // On ne touche à completedAt que si le statut change.
      ...(current.status !== data.status && { completedAt: data.status === "done" ? new Date() : null }),
    })
    .where(eq(tasks.id, id));
  await setAssignees(id, assigneeIds);
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

export async function deleteTask(id: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(tasks).where(eq(tasks.id, id));
  refresh();
  return ok(undefined);
}
