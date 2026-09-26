"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { importantDays, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDayLong } from "@/lib/dates";
import { firstError, importantDayInput, isUuid, type ImportantDayInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

// TODO(journées importantes) : journées récurrentes (anniversaire de lancement…), notifications à
// l'approche d'une journée, et envoi dans Google Agenda (lib/integrations/calendar-sync.ts).

/** Rafraîchit toutes les pages (calendrier, tableau de bord…) après une modification. */
const refresh = () => revalidatePath("/", "layout");

/**
 * Crée (`id` nul) ou modifie une journée importante. Tout membre le peut, comme pour les tâches.
 * Une seule journée importante par date et par projet.
 */
export async function saveImportantDay(id: string | null, input: ImportantDayInput): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  if (id !== null && !isUuid(id)) return fail("Journée importante introuvable.");
  const parsed = importantDayInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const data = parsed.data;

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, data.projectId));
  if (!project) return fail("Projet introuvable.");

  const [taken] = await db
    .select({ id: importantDays.id })
    .from(importantDays)
    .where(and(eq(importantDays.projectId, data.projectId), eq(importantDays.date, data.date), id ? ne(importantDays.id, id) : undefined));
  if (taken) return fail(`Le ${formatDayLong(data.date)} est déjà une journée importante de ce projet.`);

  if (id) {
    const [row] = await db.update(importantDays).set(data).where(eq(importantDays.id, id)).returning({ id: importantDays.id });
    if (!row) return fail("Journée importante introuvable.");
    refresh();
    return ok({ id: row.id });
  }
  const [row] = await db
    .insert(importantDays)
    .values({ ...data, createdBy: me.id })
    .returning({ id: importantDays.id });
  refresh();
  return ok({ id: row.id });
}

/** Retire une journée importante (la date redevient une journée ordinaire). */
export async function removeImportantDay(id: string): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return fail("Journée importante introuvable.");
  const [row] = await db.delete(importantDays).where(eq(importantDays.id, id)).returning({ id: importantDays.id });
  if (!row) return fail("Journée importante introuvable.");
  refresh();
  return ok(undefined);
}
