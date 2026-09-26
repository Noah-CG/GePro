import type { TaskPriority, TaskStatus } from "@/db/schema";

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "À faire" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminé" },
];

export const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "Haute" },
  { value: "medium", label: "Moyenne" },
  { value: "low", label: "Basse" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "Haute",
  medium: "Moyenne",
  low: "Basse",
};

/** Rang pour trier par priorité (haute d'abord). */
export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
export const STATUS_RANK: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 };

/** Palette proposée pour les projets et les avatars. */
export const COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // bleu ciel
  "#10b981", // émeraude
  "#f59e0b", // ambre
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#14b8a6", // sarcelle
  "#64748b", // ardoise
];

/**
 * Couleurs d'une journée importante : la case du calendrier en est entièrement remplie et le titre
 * est écrit en blanc par-dessus. Toutes gardent un contraste d'au moins 4,5:1 avec le blanc
 * (vérifié dans theme-contrast.test.ts). Le rouge est la couleur par défaut.
 */
export const IMPORTANT_DAY_COLORS = [
  { value: "#dc2626", label: "Rouge" },
  { value: "#c2410c", label: "Orange" },
  { value: "#15803d", label: "Vert" },
  { value: "#2563eb", label: "Bleu" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#be185d", label: "Rose" },
] as const;

export const DEFAULT_IMPORTANT_DAY_COLOR = IMPORTANT_DAY_COLORS[0].value;

/** Longueur maximale du titre d'une journée importante (affiché en gros dans la case). */
export const IMPORTANT_DAY_TITLE_MAX = 60;

/** Tri par échéance (les tâches sans échéance en dernier), puis par priorité. */
export function compareByDueThenPriority(
  a: { dueDate: string | null; priority: TaskPriority },
  b: { dueDate: string | null; priority: TaskPriority },
): number {
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}
