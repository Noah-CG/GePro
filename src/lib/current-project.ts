/**
 * Projet sélectionné : tout le site (barre latérale, tableau de bord, tâches, recherche) n'affiche
 * que ce projet. C'est celui de l'adresse sur les pages d'un projet (/projets/<id>/…) ; ailleurs,
 * le dernier choisi, mémorisé dans un cookie (simple préférence d'affichage, sans lien avec la
 * session) ; à défaut, le premier projet actif par ordre alphabétique.
 */

export const SELECTED_PROJECT_COOKIE = "gepro_projet";

const PROJECT_PATH = /^\/projets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

export function projectIdFromPath(pathname: string): string | null {
  return pathname.match(PROJECT_PATH)?.[1] ?? null;
}

type ProjectRef = { id: string; name: string; archived: boolean };

/** Projet sélectionné parmi `projects`, ou null s'il n'y a aucun projet. */
export function resolveSelectedProjectId({
  pathname,
  rememberedId,
  projects,
}: {
  pathname: string;
  rememberedId: string | null | undefined;
  projects: ProjectRef[];
}): string | null {
  const exists = (id: string | null | undefined): id is string => !!id && projects.some((p) => p.id === id);
  const fromUrl = projectIdFromPath(pathname);
  if (exists(fromUrl)) return fromUrl;
  if (exists(rememberedId)) return rememberedId;
  const [first] = projects.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return first?.id ?? null;
}

/**
 * Où aller quand on change de projet depuis le sélecteur (comme Vercel) : la même section du
 * nouveau projet (/projets/A/documents → /projets/B/documents ; un document précis ramène à la
 * liste). Null sur les autres pages : on y reste, elles se mettent à jour avec le nouveau projet.
 */
export function projectSwitchHref(pathname: string, targetId: string): string | null {
  if (!projectIdFromPath(pathname)) return null;
  const section = pathname.match(/^\/projets\/[^/]+\/(documents|parametres)(?:\/|$)/)?.[1];
  return section ? `/projets/${targetId}/${section}` : `/projets/${targetId}`;
}
