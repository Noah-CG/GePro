/** Schémas de validation partagés par les Server Actions. */
import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .nullable()
  .or(z.literal("").transform(() => null));

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide");

export const taskInput = z.object({
  projectId: z.uuid("Choisissez un projet"),
  title: z.string().trim().min(1, "Le titre est obligatoire").max(200),
  description: z.string().max(5000).default(""),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: isoDate.default(null),
  assigneeIds: z.array(z.uuid()).max(20).default([]),
});
export type TaskInput = z.input<typeof taskInput>;

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

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides";
}
