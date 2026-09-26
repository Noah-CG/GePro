/**
 * Couleur des logos de service : la couleur officielle (simple-icons), sauf quand elle se
 * distingue trop peu du fond de la barre latérale (logo GitHub quasi noir en mode sombre,
 * logo tldraw quasi blanc en mode clair…) ; on prend alors la couleur du texte (`currentColor`).
 */

/** Fond de la barre latérale (--surface dans globals.css). */
export const SURFACE = { light: "#ffffff", dark: "#141418" } as const;

/**
 * Contraste minimal pour garder la couleur officielle. Plus bas que le 3:1 du WCAG pour les
 * éléments graphiques : le logo est accompagné du titre, et à 3:1 la plupart des logos colorés
 * (jaune de Google Slides, vert de Supabase…) deviendraient gris en mode clair.
 */
export const MIN_ICON_CONTRAST = 1.6;

function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.039_28 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff);
}

/** Rapport de contraste WCAG entre deux couleurs « #rrggbb » (ou « rrggbb »), de 1 à 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Couleur du logo sur chaque thème : « #rrggbb » officiel, ou `currentColor`. */
export function iconColors(hex: string): { light: string; dark: string } {
  const pick = (surface: string) => (contrastRatio(hex, surface) >= MIN_ICON_CONTRAST ? `#${hex.replace("#", "")}` : "currentColor");
  return { light: pick(SURFACE.light), dark: pick(SURFACE.dark) };
}
