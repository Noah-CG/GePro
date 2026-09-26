/** Ancre de la section « Comptes de l'équipe » dans les paramètres du projet. */
export const MEMBERS_SECTION_ID = "comptes";

/**
 * Adresse de la gestion des comptes : les paramètres du projet sélectionné. Les comptes sont
 * communs à toute l'équipe, n'importe lequel de ses projets convient ; sans projet, la liste des projets.
 */
export function membersSettingsHref(projectId: string | null): string {
  return projectId ? `/projets/${projectId}/parametres#${MEMBERS_SECTION_ID}` : "/projets";
}
