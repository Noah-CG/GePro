/**
 * Projet sélectionné, côté serveur (pages qui ne dépendent pas de l'adresse d'un projet :
 * tableau de bord, redirection de /taches…). Voir lib/current-project.ts pour la règle.
 */
import "server-only";
import { cookies } from "next/headers";
import { resolveSelectedProjectId, SELECTED_PROJECT_COOKIE } from "./current-project";
import { getProjectOptions } from "./queries";

/** Id du projet sélectionné, ou null s'il n'existe encore aucun projet. */
export async function getSelectedProjectId(): Promise<string | null> {
  const [store, projects] = await Promise.all([cookies(), getProjectOptions()]);
  return resolveSelectedProjectId({ pathname: "", rememberedId: store.get(SELECTED_PROJECT_COOKIE)?.value, projects });
}
