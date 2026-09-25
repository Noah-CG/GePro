"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectEvents, projects } from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { scheduleCalendarSync } from "@/lib/integrations/calendar-sync";
import { eventInput, firstError, isUuid, type EventInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

/** Rafraîchit toutes les pages (calendrier, tableau de bord…) après une modification. */
const refresh = () => revalidatePath("/", "layout");

/** Message d'erreur si `me` ne peut pas modifier l'événement : seuls son créateur et les admins le peuvent. */
async function editDenied(id: string, me: SessionUser): Promise<string | null> {
  if (!isUuid(id)) return "Événement introuvable.";
  const [event] = await db.select({ createdBy: projectEvents.createdBy }).from(projectEvents).where(eq(projectEvents.id, id));
  if (!event) return "Événement introuvable.";
  if (me.role !== "admin" && event.createdBy !== me.id) {
    return "Seul le créateur de l'événement ou un administrateur peut le modifier ou le supprimer.";
  }
  return null;
}

async function projectExists(id: string | null): Promise<boolean> {
  if (!id) return true;
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id));
  return !!project;
}

export async function createEvent(input: EventInput): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const parsed = eventInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  if (!(await projectExists(parsed.data.projectId))) return fail("Projet introuvable.");

  const [event] = await db
    .insert(projectEvents)
    .values({ ...parsed.data, createdBy: me.id })
    .returning({ id: projectEvents.id });
  await scheduleCalendarSync([{ kind: "event", id: event.id }]);
  refresh();
  return ok({ id: event.id });
}

export async function updateEvent(id: string, input: EventInput): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = eventInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const denied = await editDenied(id, me);
  if (denied) return fail(denied);
  if (!(await projectExists(parsed.data.projectId))) return fail("Projet introuvable.");

  await db.update(projectEvents).set(parsed.data).where(eq(projectEvents.id, id));
  await scheduleCalendarSync([{ kind: "event", id }]);
  refresh();
  return ok(undefined);
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const denied = await editDenied(id, me);
  if (denied) return fail(denied);

  await db.delete(projectEvents).where(eq(projectEvents.id, id));
  await scheduleCalendarSync([{ kind: "event", id }]);
  refresh();
  return ok(undefined);
}
