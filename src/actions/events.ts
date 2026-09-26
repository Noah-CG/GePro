"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectEvents } from "@/db/schema";
import { atLeast, authorizeProject, authorizeProjectOf, type AccessResult } from "@/lib/access";
import { scheduleCalendarSync } from "@/lib/integrations/calendar-sync";
import { eventInput, firstError, type EventInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

/** Rafraîchit toutes les pages (calendrier, tableau de bord…) après une modification. */
const refresh = () => revalidatePath("/", "layout");

/**
 * Accès en modification à un événement : il faut être membre de son projet, et en être le
 * créateur, ou propriétaire / administrateur du projet.
 */
async function authorizeEdit(id: string): Promise<AccessResult> {
  const auth = await authorizeProjectOf("event", id);
  if (!auth.ok) return auth;
  const { user, role } = auth.access;
  const [event] = await db.select({ createdBy: projectEvents.createdBy }).from(projectEvents).where(eq(projectEvents.id, id));
  if (!atLeast(role, "admin") && event.createdBy !== user.id) {
    return { ok: false, error: "Seul le créateur de l'événement ou un administrateur du projet peut le modifier ou le supprimer." };
  }
  return auth;
}

export async function createEvent(input: EventInput): Promise<ActionResult<{ id: string }>> {
  const parsed = eventInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const auth = await authorizeProject(parsed.data.projectId);
  if (!auth.ok) return fail(auth.error);

  const [event] = await db
    .insert(projectEvents)
    .values({ ...parsed.data, createdBy: auth.access.user.id })
    .returning({ id: projectEvents.id });
  await scheduleCalendarSync([{ kind: "event", id: event.id }]);
  refresh();
  return ok({ id: event.id });
}

export async function updateEvent(id: string, input: EventInput): Promise<ActionResult> {
  const auth = await authorizeEdit(id);
  if (!auth.ok) return fail(auth.error);
  const parsed = eventInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  // Déplacé vers un autre projet : il faut en être membre aussi.
  if (parsed.data.projectId !== auth.access.projectId) {
    const target = await authorizeProject(parsed.data.projectId);
    if (!target.ok) return fail(target.error);
  }

  await db.update(projectEvents).set(parsed.data).where(eq(projectEvents.id, id));
  await scheduleCalendarSync([{ kind: "event", id }]);
  refresh();
  return ok(undefined);
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const auth = await authorizeEdit(id);
  if (!auth.ok) return fail(auth.error);

  await db.delete(projectEvents).where(eq(projectEvents.id, id));
  await scheduleCalendarSync([{ kind: "event", id }]);
  refresh();
  return ok(undefined);
}
