/** Règles des sous-tâches et des dépendances entre tâches, sans accès à la base (testées dans task-links.test.ts). */
import { COLORS } from "./constants";

/**
 * Nombre maximal de niveaux de l'arbre des tâches : tâche, sous-tâche, sous-sous-tâche, puis un
 * niveau de plus. Une tâche de profondeur MAX_TASK_DEPTH - 1 ne peut pas avoir de sous-tâches.
 */
export const MAX_TASK_DEPTH = 4;

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

/** Nœud de l'arbre des tâches. */
export type TreeTask = { id: string; parentId: string | null };

/**
 * Index de l'arbre des tâches d'un projet : parente, enfants, profondeur, tâche racine…
 * Résiste à des données incohérentes (parente absente, boucle) : la remontée s'arrête.
 */
export function taskTree<T extends TreeTask>(tasks: readonly T[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, T[]>();
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t]);
  }

  /** Ancêtres de la tâche, de sa parente jusqu'à la racine. */
  const ancestors = (id: string): T[] => {
    const result: T[] = [];
    const seen = new Set([id]);
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      result.push(parent);
      seen.add(parentId);
      parentId = parent.parentId;
    }
    return result;
  };

  /** Tous les descendants (enfants, petits-enfants…), en profondeur d'abord. */
  const descendants = (id: string): T[] => {
    const result: T[] = [];
    const seen = new Set([id]);
    const stack = [...(children.get(id) ?? [])].reverse();
    while (stack.length) {
      const t = stack.pop()!;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(t);
      stack.push(...[...(children.get(t.id) ?? [])].reverse());
    }
    return result;
  };

  /** Nombre de niveaux sous la tâche (0 pour une tâche sans sous-tâches). */
  const height = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return Math.max(0, ...(children.get(id) ?? []).map((c) => 1 + height(c.id, seen)));
  };

  return {
    get: (id: string) => byId.get(id),
    children: (id: string): T[] => children.get(id) ?? [],
    ancestors,
    descendants,
    height,
    /** 0 pour une tâche racine. */
    depth: (id: string) => ancestors(id).length,
    /** Tâche racine (la tâche elle-même si elle n'a pas de parente). */
    rootId: (id: string) => ancestors(id).at(-1)?.id ?? id,
  };
}

/** Vrai si une tâche de cette profondeur (0 = racine) peut encore recevoir des sous-tâches. */
export const canHaveSubtasks = (depth: number) => depth < MAX_TASK_DEPTH - 1;

/** Champs utiles pour savoir si une tâche peut devenir sous-tâche d'une autre. */
export type NestableTask = TreeTask & { projectId: string };

/**
 * Pourquoi `child` (tâche existante, ou `id` nul pour une création) ne peut pas devenir
 * sous-tâche de `parentId`, ou null si c'est possible. Mêmes règles côté serveur et navigateur :
 * même projet, pas de boucle, et au plus MAX_TASK_DEPTH niveaux en comptant ses propres sous-tâches.
 * `tasks` : tâches du projet (et du projet d'origine de `child` s'il en change).
 */
export function nestingError(tasks: readonly NestableTask[], child: { id: string | null; projectId: string }, parentId: string): string | null {
  if (child.id === parentId) return "Une tâche ne peut pas être sa propre sous-tâche.";
  const tree = taskTree(tasks);
  const parent = tree.get(parentId);
  if (!parent) return "Tâche parente introuvable.";
  if (parent.projectId !== child.projectId) return "La tâche parente doit appartenir au même projet.";
  if (child.id && tree.ancestors(parentId).some((a) => a.id === child.id)) {
    return "Une tâche ne peut pas devenir la sous-tâche de l'une de ses propres sous-tâches.";
  }
  const levels = tree.depth(parentId) + 2 + (child.id ? tree.height(child.id) : 0);
  if (levels > MAX_TASK_DEPTH) return `Une tâche ne peut pas avoir plus de ${MAX_TASK_DEPTH} niveaux de sous-tâches.`;
  return null;
}

/** Ligne de l'arbre affiché : la tâche, sa profondeur et sa tâche racine (qui donne sa couleur). */
export type TreeRow<T> = { task: T; depth: number; rootId: string; hasChildren: boolean };

/**
 * Range chaque tâche sous sa parente, en profondeur d'abord, en gardant l'ordre de `tasks` entre
 * tâches sœurs. Une tâche dont la parente est absente de la liste reste au premier niveau.
 * `collapsed` : tâches repliées, dont les descendants ne sont pas renvoyés.
 */
export function nestSubtasks<T extends TreeTask>(tasks: readonly T[], collapsed: ReadonlySet<string> = new Set()): TreeRow<T>[] {
  const tree = taskTree(tasks);
  const rows: TreeRow<T>[] = [];
  const seen = new Set<string>();
  const visit = (task: T, depth: number, rootId: string) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    const kids = tree.children(task.id);
    rows.push({ task, depth, rootId, hasChildren: kids.length > 0 });
    if (!collapsed.has(task.id)) for (const c of kids) visit(c, depth + 1, rootId);
  };
  for (const t of tasks) {
    if (!t.parentId || !tree.get(t.parentId)) visit(t, 0, t.id);
  }
  return rows;
}

/** Index de la dernière ligne du sous-arbre qui commence à la ligne `start` (`depths` : profondeur de chaque ligne). */
export function subtreeEnd(depths: readonly number[], start: number): number {
  let end = start;
  while (end + 1 < depths.length && depths[end + 1] > depths[start]) end++;
  return end;
}

/**
 * Tracé des lignes guides d'une ligne de l'arbre, pour chaque niveau au-dessus d'elle :
 * "through" (la ligne continue vers une tâche sœur plus bas), "end" (dernière sœur : la ligne
 * s'arrête à mi-hauteur) ou "none". Le dernier niveau est celui qui relie la ligne à sa parente.
 */
export type GuideSegment = "through" | "end" | "none";

export function guideSegments(depths: readonly number[], i: number): GuideSegment[] {
  /** Vrai si une ligne de profondeur `level` suit, avant de remonter au-dessus de ce niveau. */
  const continues = (level: number) => {
    for (let j = i + 1; j < depths.length; j++) {
      if (depths[j] < level) return false;
      if (depths[j] === level) return true;
    }
    return false;
  };
  return Array.from({ length: depths[i] }, (_, k) => {
    const next = continues(k + 1);
    return next ? "through" : k === depths[i] - 1 ? "end" : "none";
  });
}

/**
 * Ajoute aux tâches retenues par un filtre leurs ancêtres manquants (pris dans `all`), pour garder
 * le contexte d'une sous-tâche trouvée. Renvoie aussi les ids de ces ancêtres ajoutés, à griser.
 */
export function withAncestors<T extends TreeTask>(matching: readonly T[], all: readonly T[]): { tasks: T[]; contextIds: Set<string> } {
  const tree = taskTree(all);
  const kept = new Set(matching.map((t) => t.id));
  const contextIds = new Set<string>();
  for (const t of matching) {
    for (const a of tree.ancestors(t.id)) if (!kept.has(a.id)) contextIds.add(a.id);
  }
  return { tasks: [...matching, ...all.filter((t) => contextIds.has(t.id))], contextIds };
}

/**
 * Couleur d'une tâche racine, prise dans la palette des projets (8 couleurs) : les tâches n'ont
 * pas de couleur propre, elle est donc tirée d'un hash de l'id (FNV-1a), toujours le même.
 */
export function taskRootColor(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return COLORS[(hash >>> 0) % COLORS.length];
}
