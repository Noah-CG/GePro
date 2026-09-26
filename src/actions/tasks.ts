"use server";

import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { scheduleCalendarSync, taskWithSubtasks } from "@/lib/integrations/calendar-sync";
import { db } from "@/db";
import { taskAssignees, taskDependencies, tasks, type TaskStatus } from "@/db/schema";
import { allMembers, authorizeProject, authorizeProjectOf } from "@/lib/access";
import { getSubtaskIds } from "@/lib/queries";
import { createsCycle, nestingError } from "@/lib/task-links";
import { firstError, isUuid, taskDatesInput, taskInput, type TaskDatesInput, type TaskInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

/** Rafraîchit toutes les pages (tableau de bord, listes, projets) après une modification. */
const refresh = () => revalidatePath("/", "layout");

const NOT_MEMBER = "Un des responsables n'est pas membre du projet.";

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
 * Règles : même projet, au plus MAX_TASK_DEPTH niveaux, pas de boucle entre parentes ni entre
 * dépendances. `fromProjectId` : projet actuel de la tâche, si elle en change.
 * Renvoie un message d'erreur, ou null si tout est valable.
 */
async function checkLinks(
  id: string | null,
  projectId: string,
  parentId: string | null,
  dependsOnIds: string[],
  fromProjectId: string = projectId,
): Promise<string | null> {
  if (parentId) {
    // L'arbre du projet visé, plus celui d'origine : les sous-tâches de la tâche déplacée comptent.
    const tree = await db
      .select({ id: tasks.id, parentId: tasks.parentId, projectId: tasks.projectId })
      .from(tasks)
      .where(inArray(tasks.projectId, [...new Set([projectId, fromProjectId])]));
    const error = nestingError(tree, { id, projectId }, parentId);
    if (error) return error;
  }

  const deps = [...new Set(dependsOnIds)];
  if (deps.length === 0) return null;
  if (id && deps.includes(id)) return "Une tâche ne peut pas dépendre d'elle-même.";
  // Une tâche d'un autre projet est « introuvable » : on ne révèle pas son existence.
  const found = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(inArray(tasks.id, deps), eq(tasks.projectId, projectId)));
  if (found.length !== deps.length) return "Une des tâches prérequises est introuvable.";
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

/** Position après la dernière tâche sœur (même parente, ou tâches racines du projet). */
async function nextSiblingPosition(projectId: string, parentId: string | null) {
  const [row] = await db
    .select({ max: max(tasks.siblingPosition) })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), parentId ? eq(tasks.parentId, parentId) : isNull(tasks.parentId)));
  return (row?.max ?? 0) + 1024;
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { assigneeIds, dependsOnIds, ...data } = parsed.data;
  const auth = await authorizeProject(data.projectId);
  if (!auth.ok) return fail(auth.error);
  const me = auth.access.user;
  if (!(await allMembers(data.projectId, assigneeIds))) return fail(NOT_MEMBER);
  const invalid = await checkLinks(null, data.projectId, data.parentId, dependsOnIds);
  if (invalid) return fail(invalid);

  const [task] = await db
    .insert(tasks)
    .values({
      ...data,
      position: await nextPosition(data.projectId, data.status),
      siblingPosition: await nextSiblingPosition(data.projectId, data.parentId),
      completedAt: data.status === "done" ? new Date() : null,
      createdBy: me.id,
    })
    .returning({ id: tasks.id });

  await setAssignees(task.id, assigneeIds);
  await setDependencies(task.id, dependsOnIds);
  await scheduleCalendarSync([{ kind: "task", id: task.id }]);
  refresh();
  return ok({ id: task.id });
}

export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  const auth = await authorizeProjectOf("task", id);
  if (!auth.ok) return fail(auth.error);
  const parsed = taskInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { assigneeIds, dependsOnIds, ...data } = parsed.data;
  // Déplacée vers un autre projet : il faut en être membre aussi.
  if (data.projectId !== auth.access.projectId) {
    const target = await authorizeProject(data.projectId);
    if (!target.ok) return fail(target.error);
  }
  if (!(await allMembers(data.projectId, assigneeIds))) return fail(NOT_MEMBER);

  const [current] = await db
    .select({ status: tasks.status, projectId: tasks.projectId, parentId: tasks.parentId })
    .from(tasks)
    .where(eq(tasks.id, id));
  if (!current) return fail("Tâche introuvable.");
  const invalid = await checkLinks(id, data.projectId, data.parentId, dependsOnIds, current.projectId);
  if (invalid) return fail(invalid);

  const moved = current.parentId !== data.parentId || current.projectId !== data.projectId;
  await db
    .update(tasks)
    .set({
      ...data,
      // On ne touche à completedAt que si le statut change.
      ...(current.status !== data.status && { completedAt: data.status === "done" ? new Date() : null }),
      // Nouvelle parente : la tâche passe après ses nouvelles sœurs.
      ...(moved && { siblingPosition: await nextSiblingPosition(data.projectId, data.parentId) }),
    })
    .where(eq(tasks.id, id));
  await setAssignees(id, assigneeIds);
  await setDependencies(id, dependsOnIds);

  if (current.projectId !== data.projectId) {
    // Les sous-tâches (à tous les niveaux) suivent leur parente dans le nouveau projet…
    const subtree = [id, ...(await getSubtaskIds(id))];
    await db.update(tasks).set({ projectId: data.projectId }).where(inArray(tasks.id, subtree));
    // …et les dépendances devenues inter-projets n'ont plus de sens.
    await db.execute(sql`
      delete from ${taskDependencies} d
      using ${tasks} a, ${tasks} b
      where a.id = d.task_id and b.id = d.depends_on_id and a.project_id <> b.project_id
        and (a.id in ${subtree} or b.id in ${subtree})
    `);
  }
  // Les sous-tâches aussi : elles ont pu changer de projet avec leur parente.
  await scheduleCalendarSync(() => taskWithSubtasks(id));
  refresh();
  return ok(undefined);
}

/**
 * Changement de statut (Kanban, case à cocher, liste).
 * `position` est fourni par le Kanban ; sinon la tâche va en bas de la colonne.
 * Terminer une tâche ne termine pas ses sous-tâches (et inversement).
 */
export async function moveTask(id: string, status: TaskStatus, position?: number): Promise<ActionResult> {
  const auth = await authorizeProjectOf("task", id);
  if (!auth.ok) return fail(auth.error);
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
  await scheduleCalendarSync([{ kind: "task", id }]);
  refresh();
  return ok(undefined);
}

/** Nouvelles dates d'une tâche (glisser-déposer ou clavier dans le diagramme de Gantt). */
export async function setTaskDates(id: string, input: TaskDatesInput): Promise<ActionResult> {
  const auth = await authorizeProjectOf("task", id);
  if (!auth.ok) return fail(auth.error);
  const parsed = taskDatesInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [row] = await db.update(tasks).set(parsed.data).where(eq(tasks.id, id)).returning({ id: tasks.id });
  if (!row) return fail("Tâche introuvable.");
  await scheduleCalendarSync([{ kind: "task", id }]);
  refresh();
  return ok(undefined);
}

/** Rattache une tâche à une parente, ou la détache (`parentId` nul) : glisser-déposer de la vue liste. */
export async function setTaskParent(id: string, parentId: string | null): Promise<ActionResult> {
  const auth = await authorizeProjectOf("task", id);
  if (!auth.ok) return fail(auth.error);
  if (parentId !== null && !isUuid(parentId)) return fail("Tâche introuvable.");
  const [current] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, id));
  if (!current) return fail("Tâche introuvable.");
  const invalid = await checkLinks(id, current.projectId, parentId, []);
  if (invalid) return fail(invalid);

  await db
    .update(tasks)
    .set({ parentId, siblingPosition: await nextSiblingPosition(current.projectId, parentId) })
    .where(eq(tasks.id, id));
  refresh();
  return ok(undefined);
}

/** Supprime une tâche et, en cascade, toutes ses sous-tâches (à tous les niveaux). */
export async function deleteTask(id: string): Promise<ActionResult> {
  const auth = await authorizeProjectOf("task", id);
  if (!auth.ok) return fail(auth.error);
  // Avant la suppression : ses sous-tâches disparaissent avec elle (cascade).
  await scheduleCalendarSync(() => taskWithSubtasks(id));
  await db.delete(tasks).where(eq(tasks.id, id));
  refresh();
  return ok(undefined);
}

/** Tâche proposée comme parente ou comme prérequis dans la fenêtre d'édition. */
export type TaskOption = { id: string; title: string; status: TaskStatus; parentId: string | null; projectId: string };

/** Tâches d'un projet, pour choisir une tâche parente ou des dépendances. */
export async function getTaskOptions(projectId: string): Promise<TaskOption[]> {
  if (!(await authorizeProject(projectId)).ok) return [];
  return db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, parentId: tasks.parentId, projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.title));
}
