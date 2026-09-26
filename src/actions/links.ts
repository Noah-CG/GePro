"use server";

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectLinks, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { firstError, isUuid, projectLinkInput, type ProjectLinkInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

// TODO(liens utiles) : réordonner les liens par glisser-déposer (la colonne `position` est prête),
// choisir l'icône à la main quand le service n'est pas reconnu, ranger les liens en dossiers.

/** Rafraîchit la barre latérale (chargée par le layout) après une modification. */
const refresh = () => revalidatePath("/", "layout");

/**
 * Ajoute un lien utile à la fin de la liste du projet. Tout membre le peut : GePro n'a pas de
 * membres par projet, chaque compte a accès à tous les projets (comme pour les tâches).
 */
export async function createProjectLink(projectId: string, input: ProjectLinkInput): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  if (!isUuid(projectId)) return fail("Projet introuvable.");
  const parsed = projectLinkInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!project) return fail("Projet introuvable.");

  const [{ last }] = await db
    .select({ last: max(projectLinks.position) })
    .from(projectLinks)
    .where(eq(projectLinks.projectId, projectId));
  const [row] = await db
    .insert(projectLinks)
    .values({ ...parsed.data, projectId, position: (last ?? -1) + 1, createdBy: me.id })
    .returning({ id: projectLinks.id });
  refresh();
  return ok({ id: row.id });
}

/** Modifie l'adresse et le titre d'un lien utile. */
export async function updateProjectLink(id: string, input: ProjectLinkInput): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return fail("Lien introuvable.");
  const parsed = projectLinkInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [row] = await db.update(projectLinks).set(parsed.data).where(eq(projectLinks.id, id)).returning({ id: projectLinks.id });
  if (!row) return fail("Lien introuvable.");
  refresh();
  return ok(undefined);
}

export async function deleteProjectLink(id: string): Promise<ActionResult> {
  await requireUser();
  if (!isUuid(id)) return fail("Lien introuvable.");
  const [row] = await db.delete(projectLinks).where(eq(projectLinks.id, id)).returning({ id: projectLinks.id });
  if (!row) return fail("Lien introuvable.");
  refresh();
  return ok(undefined);
}
