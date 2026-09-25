/** Règles des sous-tâches et des dépendances entre tâches, sans accès à la base (testées dans task-links.test.ts). */

export type DependencyEdge = { taskId: string; dependsOnId: string };

/**
 * Vrai si faire dépendre `taskId` de `dependsOnIds` créerait un cycle, c'est-à-dire si
 * `taskId` est déjà (directement ou non) un prérequis de l'une de ces tâches.
 * `edges` : dépendances existantes du projet (celles de `taskId` sont ignorées, elles vont être remplacées).
 */
export function createsCycle(edges: DependencyEdge[], taskId: string, dependsOnIds: string[]): boolean {
  const prerequisites = new Map<string, string[]>();
  for (const e of edges) {
    if (e.taskId === taskId) continue;
    prerequisites.set(e.taskId, [...(prerequisites.get(e.taskId) ?? []), e.dependsOnId]);
  }
  const seen = new Set<string>();
  const stack = [...dependsOnIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(prerequisites.get(id) ?? []));
  }
  return false;
}

/** Champs utiles pour savoir si une tâche peut devenir sous-tâche d'une autre. */
export type NestableTask = { id: string; projectId: string; parentId: string | null; subtasks: { total: number } };

/**
 * Pourquoi `child` ne peut pas devenir sous-tâche de `parent` (mêmes règles que le serveur),
 * ou null si c'est possible.
 */
export function nestingError(child: NestableTask, parent: NestableTask): string | null {
  if (child.id === parent.id) return "Une tâche ne peut pas être sa propre sous-tâche.";
  if (child.parentId === parent.id) return "C'est déjà une sous-tâche de cette tâche.";
  if (child.projectId !== parent.projectId) return "La tâche parente doit appartenir au même projet.";
  if (parent.parentId) return "Une sous-tâche ne peut pas avoir elle-même de sous-tâches.";
  if (child.subtasks.total > 0) return "Cette tâche a des sous-tâches : elle ne peut pas devenir une sous-tâche.";
  return null;
}

/**
 * Range chaque sous-tâche juste sous sa parente (profondeur 1), en gardant l'ordre de `tasks`
 * pour les parentes comme pour les sous-tâches. Une sous-tâche dont la parente est absente
 * de la liste (filtrée) reste au premier niveau.
 */
export function nestSubtasks<T extends { id: string; parentId: string | null }>(tasks: T[]): { task: T; depth: 0 | 1 }[] {
  const ids = new Set(tasks.map((t) => t.id));
  const children = new Map<string, T[]>();
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t]);
  }
  const rows: { task: T; depth: 0 | 1 }[] = [];
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) continue;
    rows.push({ task: t, depth: 0 });
    for (const c of children.get(t.id) ?? []) rows.push({ task: c, depth: 1 });
  }
  return rows;
}
