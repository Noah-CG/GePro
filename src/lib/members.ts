/** Ancre de la section « Membres de l'équipe » dans les paramètres du projet. */
export const MEMBERS_SECTION_ID = "membres";

/**
 * Adresse de la gestion des membres : les paramètres du projet sélectionné. Les comptes sont
 * communs à toute l'équipe, n'importe quel projet convient ; sans projet, la liste des projets.
 */
export function membersSettingsHref(projectId: string | null): string {
  return projectId ? `/projets/${projectId}/parametres#${MEMBERS_SECTION_ID}` : "/projets";
}
