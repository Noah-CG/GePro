"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { workSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getSelectedProjectId } from "@/lib/selected-project";
import { firstError, workNote } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");
const UUID = /^[0-9a-f-]{36}$/i;

/** Période qui vient d'être arrêtée, pour proposer d'en rédiger le journal. */
export type StoppedSession = { id: string; durationMs: number };

/**
 * Démarre le chrono du membre connecté, rattaché au projet sélectionné.
 * Sans effet s'il tourne déjà (index unique sur le chrono en cours) : un double clic ou un
 * second onglet ne crée pas deux périodes.
 */
export async function startWorkTimer(): Promise<ActionResult> {
  const me = await requireUser();
  const projectId = await getSelectedProjectId();
  await db.insert(workSessions).values({ userId: me.id, projectId }).onConflictDoNothing();
  refresh();
  return ok(undefined);
}

/**
 * Arrête le chrono en cours : la période écoulée est enregistrée comme temps de travail.
 * Renvoie null si aucun chrono ne tournait (déjà arrêté depuis un autre onglet).
 */
export async function stopWorkTimer(): Promise<ActionResult<StoppedSession | null>> {
  const me = await requireUser();
  const [row] = await db
    .update(workSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(workSessions.userId, me.id), isNull(workSessions.endedAt)))
    .returning({ id: workSessions.id, startedAt: workSessions.startedAt, endedAt: workSessions.endedAt });
  refresh();
  return ok(row ? { id: row.id, durationMs: row.endedAt!.getTime() - row.startedAt.getTime() } : null);
}

/** Rédige ou modifie le journal de bord d'une de ses propres périodes de travail. */
export async function saveWorkNote(id: string, note: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!UUID.test(id)) return fail("Session introuvable.");
  const parsed = workNote.safeParse(note);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [row] = await db
    .update(workSessions)
    .set({ note: parsed.data })
    .where(and(eq(workSessions.id, id), eq(workSessions.userId, me.id)))
    .returning({ id: workSessions.id });
  if (!row) return fail("Session introuvable.");
  refresh();
  return ok(undefined);
}
