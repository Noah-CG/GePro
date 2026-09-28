import type { TaskStatus } from "../src/db/schema";

export const E2E_USER = { email: "e2e@exemple.fr", password: "e2e-demo-1234" };

type SeedTask = { title: string; status: TaskStatus; parent?: string };

/** Assez de tâches « À faire » pour que les colonnes soient hautes, comme dans un vrai projet. */
const backlog = (prefix: string, n: number): SeedTask[] =>
  Array.from({ length: n }, (_, i) => ({ title: `${prefix} ${i + 1}`, status: "todo" as const }));

export const PROJECTS = {
  empty: {
    name: "E2E Terminé vide",
    tasks: [
      { title: "Racine à terminer", status: "todo" },
      ...backlog("Backlog vide", 6),
      { title: "En cours à terminer", status: "in_progress" },
      { title: "En cours reste", status: "in_progress" },
    ],
  },
  filled: {
    name: "E2E Terminé rempli",
    tasks: [
      { title: "Racine vers rempli", status: "todo" },
      ...backlog("Backlog rempli", 5),
      { title: "En cours vers rempli", status: "in_progress" },
      { title: "Déjà fini 1", status: "done" },
      { title: "Déjà fini 2", status: "done" },
    ],
  },
  subtasks: {
    name: "E2E Sous-tâches",
    tasks: [
      { title: "Parente", status: "todo" },
      { title: "Sous-tâche A", status: "todo", parent: "Parente" },
      { title: "Sous-tâche B", status: "in_progress", parent: "Parente" },
      ...backlog("Backlog sous-tâches", 5),
    ],
  },
  back: {
    name: "E2E Retour",
    tasks: [...backlog("Backlog retour", 6), { title: "Finie à rouvrir", status: "done" }, { title: "En cours retour", status: "in_progress" }],
  },
  touch: {
    name: "E2E Tactile",
    tasks: [{ title: "Au doigt", status: "todo" }, ...backlog("Backlog tactile", 6), { title: "En cours tactile", status: "in_progress" }],
  },
  failure: {
    name: "E2E Échec serveur",
    tasks: [{ title: "Non enregistrée", status: "todo" }, ...backlog("Backlog échec", 3), { title: "En cours échec", status: "in_progress" }],
  },
  short: {
    name: "E2E Colonnes courtes",
    tasks: [
      { title: "Racine courte", status: "todo" },
      { title: "Parente courte", status: "todo" },
      { title: "Sous-tâche courte", status: "todo", parent: "Parente courte" },
      { title: "Sous-tâche en cours", status: "in_progress", parent: "Parente courte" },
      { title: "En cours court", status: "in_progress" },
    ],
  },
} satisfies Record<string, { name: string; tasks: SeedTask[] }>;
