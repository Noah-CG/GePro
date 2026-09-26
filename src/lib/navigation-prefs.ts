/**
 * Préférences d'affichage de la barre latérale, mémorisées dans des cookies pour que le rendu
 * serveur corresponde d'emblée à ce que l'utilisateur a choisi (pas de clignotement).
 * Sans lien avec la session.
 */

/** Présent (valeur "1") quand la barre latérale est réduite aux icônes. */
export const SIDEBAR_COLLAPSED_COOKIE = "gepro_sidebar_reduite";

/** Sections repliées, séparées par des points : "documents.liens". */
export const COLLAPSED_SECTIONS_COOKIE = "gepro_sections_repliees";

export const SIDEBAR_SECTIONS = ["documents", "liens"] as const;
export type SidebarSectionId = (typeof SIDEBAR_SECTIONS)[number];

const isSection = (value: string): value is SidebarSectionId => (SIDEBAR_SECTIONS as readonly string[]).includes(value);

/** Lit le cookie des sections repliées ; ignore toute valeur inconnue. */
export function parseCollapsedSections(value: string | undefined): SidebarSectionId[] {
  return [...new Set((value ?? "").split(".").filter(isSection))];
}

export function serializeCollapsedSections(sections: SidebarSectionId[]): string | null {
  return sections.length ? [...new Set(sections)].join(".") : null;
}

/** Enregistre une préférence d'affichage pour un an, sur tout le site (null : la supprime). */
export function savePreferenceCookie(name: string, value: string | null) {
  document.cookie =
    value === null
      ? `${name}=; path=/; max-age=0; samesite=lax`
      : `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}
