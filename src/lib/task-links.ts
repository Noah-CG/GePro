/** Règles des dépendances entre tâches, sans accès à la base (testées dans task-links.test.ts). */

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
