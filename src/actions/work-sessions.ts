"use server";

import { and, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projects, users, workSessions } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { addDays, formatDateTime, formatTime, zonedInstant } from "@/lib/dates";
import { getSelectedProjectId } from "@/lib/selected-project";
import { firstError, workNote, workSessionInput, type WorkSessionInput } from "@/lib/validation";
import { endsNextDay } from "@/lib/work-time";
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

/** Rédige ou modifie le journal de bord d'une de ses propres périodes de travail (le chrono vient de s'arrêter). */
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

// Saisie et correction manuelles du temps de travail (page Temps de travail).
// Chacun corrige ses propres périodes ; un administrateur peut corriger celles de tous.

const FORBIDDEN = "Seul le membre concerné ou un administrateur peut modifier ce temps de travail.";

const canEditWorkOf = (me: SessionUser, userId: string) => me.role === "admin" || me.id === userId;

type Period = { userId: string; projectId: string | null; startedAt: Date; endedAt: Date; note: string };

/**
 * Valide une saisie et la traduit en période : instants dans le fuseau de l'équipe, fin le
 * lendemain si elle précède le début, ni dans le futur ni à cheval sur une autre période.
 */
async function toPeriod(userId: string, input: WorkSessionInput, excludeId?: string): Promise<Period | string> {
  const parsed = workSessionInput.safeParse(input);
  if (!parsed.success) return firstError(parsed.error);
  const { date, start, end, projectId, note } = parsed.data;

  const startedAt = zonedInstant(date, start);
  const endedAt = zonedInstant(endsNextDay(start, end) ? addDays(date, 1) : date, end);
  if (endedAt.getTime() <= startedAt.getTime()) return "L'heure de fin doit être après l'heure de début.";
  if (endedAt.getTime() > Date.now() + 60_000) return "Une période de travail ne peut pas se terminer dans le futur.";

  if (projectId) {
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
    if (!project) return "Projet introuvable.";
  }

  // Chevauchement avec une autre période du même membre (un chrono en cours court jusqu'à maintenant).
  const [overlap] = await db
    .select({ startedAt: workSessions.startedAt, endedAt: workSessions.endedAt })
    .from(workSessions)
    .where(
      and(
        eq(workSessions.userId, userId),
        excludeId ? ne(workSessions.id, excludeId) : undefined,
        lt(workSessions.startedAt, endedAt),
        or(isNull(workSessions.endedAt), gt(workSessions.endedAt, startedAt)),
      ),
    )
    .limit(1);
  if (overlap) {
    const other = `${formatDateTime(overlap.startedAt.toISOString())} → ${overlap.endedAt ? formatTime(overlap.endedAt.toISOString()) : "en cours"}`;
    return `Cette période chevauche une autre période de travail (${other}).`;
  }
  return { userId, projectId, startedAt, endedAt, note };
}

/** Ajoute une période oubliée (chrono non lancé) au temps de travail de `userId`. */
export async function createWorkSession(userId: string, input: WorkSessionInput): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  if (!UUID.test(userId)) return fail("Membre introuvable.");
  if (!canEditWorkOf(me, userId)) return fail(FORBIDDEN);
  const [member] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!member) return fail("Membre introuvable.");

  const period = await toPeriod(userId, input);
  if (typeof period === "string") return fail(period);
  const [row] = await db.insert(workSessions).values(period).returning({ id: workSessions.id });
  refresh();
  return ok({ id: row.id });
}

/**
 * Corrige une période : date, heures, projet et journal. Sur un chrono en cours, la correction
 * l'arrête à l'heure de fin saisie (chrono oublié le soir, par exemple).
 */
export async function updateWorkSession(id: string, input: WorkSessionInput): Promise<ActionResult> {
  const me = await requireUser();
  const session = await findSession(id);
  if (!session) return fail("Période introuvable.");
  if (!canEditWorkOf(me, session.userId)) return fail(FORBIDDEN);

  const period = await toPeriod(session.userId, input, id);
  if (typeof period === "string") return fail(period);
  await db.update(workSessions).set(period).where(eq(workSessions.id, id));
  refresh();
  return ok(undefined);
}

/** Supprime une période du temps de travail (saisie par erreur, doublon…). */
export async function deleteWorkSession(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const session = await findSession(id);
  if (!session) return fail("Période introuvable.");
  if (!canEditWorkOf(me, session.userId)) return fail(FORBIDDEN);

  await db.delete(workSessions).where(eq(workSessions.id, id));
  refresh();
  return ok(undefined);
}

async function findSession(id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db.select({ userId: workSessions.userId }).from(workSessions).where(eq(workSessions.id, id));
  return row ?? null;
}

