"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { workSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getSelectedProjectId } from "@/lib/selected-project";
import { ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

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

/** Arrête le chrono en cours : la période écoulée est enregistrée comme temps de travail. */
export async function stopWorkTimer(): Promise<ActionResult> {
  const me = await requireUser();
  await db
    .update(workSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(workSessions.userId, me.id), isNull(workSessions.endedAt)));
  refresh();
  return ok(undefined);
}
