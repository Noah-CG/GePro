"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { projectMembers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  getCalendarSyncView,
  reconcileCalendar,
  saveCalendarSyncSettings,
  stopCalendarSync as stopSync,
  type SyncReport,
} from "@/lib/integrations/calendar-sync";
import { integrationErrorMessage, reportIntegrationError } from "@/lib/integrations/errors";
import { firstError } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const settingsInput = z.object({
  projectIds: z.array(z.uuid()).max(200),
  tasksMode: z.enum(["mine", "all", "none"]),
});
export type CalendarSyncInput = z.input<typeof settingsInput>;

const refresh = () => revalidatePath("/calendrier");

/** Message si le compte Google ne permet pas (encore) d'écrire dans Google Agenda, sinon null. */
async function accountProblem(userId: string): Promise<string | null> {
  const { configured, account } = await getCalendarSyncView(userId);
  if (!configured) return integrationErrorMessage("not_configured");
  if (!account) return "Connectez d'abord votre compte Google.";
  if (account.status !== "active") return integrationErrorMessage("reauth_required");
  if (!account.hasCalendarScope) return integrationErrorMessage("missing_calendar_scope");
  return null;
}

async function runReconcile(userId: string): Promise<ActionResult<SyncReport>> {
  try {
    return ok(await reconcileCalendar(userId));
  } catch (e) {
    return fail(integrationErrorMessage(reportIntegrationError(e)));
  }
}

/**
 * Active la synchronisation ou change ses réglages, puis synchronise tout l'agenda. Les réglages
 * sont enregistrés même si Google échoue : « Synchroniser maintenant » réessaiera.
 */
export async function saveCalendarSync(input: CalendarSyncInput): Promise<ActionResult<SyncReport>> {
  const me = await requireUser();
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const problem = await accountProblem(me.id);
  if (problem) return fail(problem);

  // Seulement des projets dont on est membre : sinon « introuvable », comme un projet inexistant.
  const ids = [...new Set(parsed.data.projectIds)];
  const mine = ids.length
    ? await db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.userId, me.id), inArray(projectMembers.projectId, ids)))
    : [];
  if (mine.length !== ids.length) return fail("Projet introuvable.");

  await saveCalendarSyncSettings(me.id, { tasksMode: parsed.data.tasksMode, projectIds: ids });
  const result = await runReconcile(me.id);
  refresh();
  return result;
}

export async function syncCalendarNow(): Promise<ActionResult<SyncReport>> {
  const me = await requireUser();
  const problem = await accountProblem(me.id);
  if (problem) return fail(problem);
  const result = await runReconcile(me.id);
  refresh();
  return result;
}

/** Arrête la synchronisation ; `removeCalendar` : supprime aussi l'agenda « GePro » de Google Agenda. */
export async function stopCalendarSync(removeCalendar: boolean): Promise<ActionResult> {
  const me = await requireUser();
  try {
    await stopSync(me.id, removeCalendar);
  } catch (e) {
    return fail(`${integrationErrorMessage(reportIntegrationError(e))} La synchronisation n'a pas été arrêtée.`);
  }
  refresh();
  return ok(undefined);
}
