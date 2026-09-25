/** Schémas de validation partagés par les Server Actions. */
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .nullable()
  .or(z.literal("").transform(() => null));

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide");

const START_AFTER_DUE = "Le début doit précéder l'échéance";
const startBeforeDue = (t: { startDate: string | null; dueDate: string | null }) =>
  !t.startDate || !t.dueDate || t.startDate <= t.dueDate;

export const taskInput = z
  .object({
    projectId: z.uuid("Choisissez un projet"),
    title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
    description: z.string().max(5000).default(""),
    status: z.enum(["todo", "in_progress", "done"]).default("todo"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    startDate: isoDate.default(null),
    dueDate: isoDate.default(null),
    assigneeIds: z.array(z.uuid()).max(20).default([]),
    /** Tâche parente (sous-tâche) : nulle ou "" pour une tâche de premier niveau. */
    parentId: z.uuid().nullable().or(z.literal("").transform(() => null)).default(null),
    /** Tâches à terminer avant celle-ci. */
    dependsOnIds: z.array(z.uuid()).max(50, "50 dépendances au maximum").default([]),
  })
  .refine(startBeforeDue, { message: START_AFTER_DUE, path: ["startDate"] });
export type TaskInput = z.input<typeof taskInput>;

/** Déplacement ou redimensionnement d'une barre du diagramme de Gantt. */
export const taskDatesInput = z
  .object({ startDate: isoDate, dueDate: isoDate })
  .refine(startBeforeDue, { message: START_AFTER_DUE, path: ["startDate"] });
export type TaskDatesInput = z.input<typeof taskDatesInput>;

export const projectInput = z
  .object({
    name: z.string().trim().min(1, "Le nom est obligatoire").max(120),
    description: z.string().max(5000).default(""),
    color,
    startDate: isoDate.default(null),
    endDate: isoDate.default(null),
  })
  .refine((p) => !p.startDate || !p.endDate || p.startDate <= p.endDate, {
    message: "La date de fin doit être après la date de début",
    path: ["endDate"],
  });
export type ProjectInput = z.input<typeof projectInput>;

/** Vraie date du calendrier au format "YYYY-MM-DD" (refuse par exemple un 31 septembre). */
const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez une date")
  .refine((iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Date invalide");

export const eventInput = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
  description: z.string().max(5000).default(""),
  eventDate: requiredDate,
  color,
  /** Facultatif : sans projet, l'événement concerne toute l'équipe. */
  projectId: z.uuid("Projet invalide").nullable().or(z.literal("").transform(() => null)).default(null),
});
export type EventInput = z.input<typeof eventInput>;

export const memberInput = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(80),
  email: z.email("Email invalide").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "8 caractères minimum"),
  role: z.enum(["admin", "member"]).default("member"),
});
export type MemberInput = z.input<typeof memberInput>;

export const password = z.string().min(8, "8 caractères minimum");

export const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** Rattachement d'un Google Doc : lien collé ou identifiant choisi dans la recherche. */
export const attachDocInput = z.object({
  projectId: z.uuid("Projet invalide"),
  link: z.string().trim().min(1, "Collez le lien d'un Google Doc ou choisissez-en un").max(500, "Lien trop long"),
});

export const docSearchQuery = z.string().trim().max(100, "Recherche trop longue");

/** Premier message d'erreur lisible d'une validation Zod. */
/** Journal de bord d'une période de travail. */
export const workNote = z.string().trim().max(5000, "Le journal est limité à 5 000 caractères.");

const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (ex. 09:30)");

/**
 * Période de travail saisie ou corrigée à la main : une date et deux heures dans le fuseau de
 * l'équipe. Une fin antérieure (ou égale) au début tombe le lendemain.
 */
export const workSessionInput = z
  .object({
    date: requiredDate,
    start: clockTime,
    end: clockTime,
    projectId: z.uuid("Projet invalide").nullable().or(z.literal("").transform(() => null)).default(null),
    note: workNote.default(""),
  })
  .refine((v) => v.start !== v.end, { message: "L'heure de fin doit être différente de l'heure de début.", path: ["end"] });
export type WorkSessionInput = z.input<typeof workSessionInput>;

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides";
}
