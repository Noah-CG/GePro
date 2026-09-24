/**
 * Saisie manuelle du temps de travail : règles communes au navigateur (retour immédiat) et au
 * serveur (validation qui fait foi).
 */

/**
 * Heure saisie au clavier, normalisée en "HH:MM" : accepte "9", "9h", "9h30", "930", "09:30"…
 * Renvoie null si ce n'est pas une heure valide.
 */
export function parseClockTime(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, "");
  const match = value.match(/^(\d{1,2})(?:[:h.](\d{0,2}))?$/) ?? value.match(/^(\d{1,2})(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Vrai si la période finit le lendemain de son début (fin égale ou antérieure à l'heure de début). */
export const endsNextDay = (start: string, end: string) => end <= start;

/** Durée (ms) d'une période saisie "HH:MM" → "HH:MM", en passant minuit si besoin (hors changement d'heure). */
export function clockDurationMs(start: string, end: string): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(end) - toMin(start);
  return (diff <= 0 ? diff + 24 * 60 : diff) * 60_000;
}
