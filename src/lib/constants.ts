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
