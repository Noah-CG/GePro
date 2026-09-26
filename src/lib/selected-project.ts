/**
 * Projet sélectionné, côté serveur (pages qui ne dépendent pas de l'adresse d'un projet :
 * tableau de bord, redirection de /taches…). Voir lib/current-project.ts pour la règle.
 * Toujours choisi parmi les projets dont l'utilisateur est membre : le cookie n'est qu'une
 * préférence, jamais une autorisation.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSelectedProjectId, SELECTED_PROJECT_COOKIE } from "./current-project";
import { getProjectOptions, type ProjectOption } from "./queries";

/** Projet sélectionné parmi ceux de `userId`, ou null s'il n'est membre d'aucun projet. */
export async function getSelectedProject(userId: string): Promise<ProjectOption | null> {
  const [store, projects] = await Promise.all([cookies(), getProjectOptions(userId)]);
  const id = resolveSelectedProjectId({ pathname: "", rememberedId: store.get(SELECTED_PROJECT_COOKIE)?.value, projects });
  return projects.find((p) => p.id === id) ?? null;
}

/** Id du projet sélectionné, ou null si `userId` n'est membre d'aucun projet. */
export async function getSelectedProjectId(userId: string): Promise<string | null> {
  return (await getSelectedProject(userId))?.id ?? null;
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Anciennes adresses sans projet (/calendrier, /temps, /taches…) : la même page dans le projet
 * sélectionné, paramètres gardés (anciens liens et favoris restent valides). L'adresse fait
 * ensuite foi. Sans aucun projet : la liste des projets.
 */
export async function redirectToSelectedProject(userId: string, section: string, searchParams: SearchParams): Promise<never> {
  const projectId = await getSelectedProjectId(userId);
  if (!projectId) redirect("/projets");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  redirect(`/projets/${projectId}${section ? `/${section}` : ""}${query.size ? `?${query}` : ""}`);
}
