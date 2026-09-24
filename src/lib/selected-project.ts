/**
 * Projet sélectionné, côté serveur (pages qui ne dépendent pas de l'adresse d'un projet :
 * tableau de bord, redirection de /taches…). Voir lib/current-project.ts pour la règle.
 */
import "server-only";
import { cookies } from "next/headers";
import { resolveSelectedProjectId, SELECTED_PROJECT_COOKIE } from "./current-project";
import { getProjectOptions, type ProjectOption } from "./queries";

/** Projet sélectionné, ou null s'il n'existe encore aucun projet. */
export async function getSelectedProject(): Promise<ProjectOption | null> {
  const [store, projects] = await Promise.all([cookies(), getProjectOptions()]);
  const id = resolveSelectedProjectId({ pathname: "", rememberedId: store.get(SELECTED_PROJECT_COOKIE)?.value, projects });
  return projects.find((p) => p.id === id) ?? null;
}

/** Id du projet sélectionné, ou null s'il n'existe encore aucun projet. */
export async function getSelectedProjectId(): Promise<string | null> {
  return (await getSelectedProject())?.id ?? null;
}
