"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { createProjectWithOwner } from "@/db/create-project";
import { projects } from "@/db/schema";
import { authorizeProject } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { calendarSyncUsersOf, scheduleProjectCalendarSync, scheduleReconcile } from "@/lib/integrations/calendar-sync";
import { firstError, projectInput, type ProjectInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  // Projet vierge, dont le créateur est le propriétaire et le seul membre.
  const project = await createProjectWithOwner(db, parsed.data, me.id);
  refresh();
  return ok({ id: project.id });
}

/** Nom, description, couleur et dates : propriétaire et administrateurs du projet. */
export async function updateProject(id: string, input: ProjectInput): Promise<ActionResult> {
  const auth = await authorizeProject(id, "admin");
  if (!auth.ok) return fail(auth.error);
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  await db.update(projects).set(parsed.data).where(eq(projects.id, id));
  // Nom et couleur figurent dans les agendas Google.
  await scheduleProjectCalendarSync(id);
  refresh();
  return ok(undefined);
}

export async function setProjectArchived(id: string, archived: boolean): Promise<ActionResult> {
  const auth = await authorizeProject(id, "admin");
  if (!auth.ok) return fail(auth.error);
  await db
    .update(projects)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(projects.id, id));
  // Projet archivé : ses éléments quittent les agendas Google (et y reviennent au désarchivage).
  await scheduleProjectCalendarSync(id);
  refresh();
  return ok(undefined);
}

/**
 * Supprime définitivement le projet et, en cascade, toutes ses données (tâches, événements,
 * journées importantes, documents, fichiers, salon Discord, membres, invitations). Le temps de
 * travail des membres est conservé, « sans projet ». Réservé au propriétaire.
 */
export async function deleteProject(id: string): Promise<ActionResult> {
  const auth = await authorizeProject(id, "owner");
  if (!auth.ok) return fail(auth.error);
  // Avant la suppression (la cascade efface ce lien) : agendas Google à nettoyer ensuite.
  const syncing = await calendarSyncUsersOf(id);
  await db.delete(projects).where(eq(projects.id, id));
  await scheduleReconcile(syncing);
  refresh();
  return ok(undefined);
}
