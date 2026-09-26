"use server";

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectLinks } from "@/db/schema";
import { authorizeProject, authorizeProjectOf } from "@/lib/access";
import { firstError, projectLinkInput, type ProjectLinkInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

// TODO(liens utiles) : réordonner les liens par glisser-déposer (la colonne `position` est prête),
// choisir l'icône à la main quand le service n'est pas reconnu, ranger les liens en dossiers.

/** Rafraîchit la barre latérale (chargée par le layout) après une modification. */
const refresh = () => revalidatePath("/", "layout");

/** Ajoute un lien utile à la fin de la liste du projet. Tout membre du projet le peut, comme pour les tâches. */
export async function createProjectLink(projectId: string, input: ProjectLinkInput): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeProject(projectId);
  if (!auth.ok) return fail(auth.error);
  const me = auth.access.user;
  const parsed = projectLinkInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

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
  const auth = await authorizeProjectOf("link", id);
  if (!auth.ok) return fail(auth.error);
  const parsed = projectLinkInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [row] = await db.update(projectLinks).set(parsed.data).where(eq(projectLinks.id, id)).returning({ id: projectLinks.id });
  if (!row) return fail("Lien introuvable.");
  refresh();
  return ok(undefined);
}

export async function deleteProjectLink(id: string): Promise<ActionResult> {
  const auth = await authorizeProjectOf("link", id);
  if (!auth.ok) return fail(auth.error);
  const [row] = await db.delete(projectLinks).where(eq(projectLinks.id, id)).returning({ id: projectLinks.id });
  if (!row) return fail("Lien introuvable.");
  refresh();
  return ok(undefined);
}
