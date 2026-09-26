/**
 * Utilitaires de dates. Toutes les dates "métier" sont des chaînes ISO "YYYY-MM-DD" :
 * elles se comparent directement comme des chaînes (ordre lexicographique = chronologique).
 */

// trim() : une variable collée dans Vercel peut garder un retour à la ligne final.
export const APP_TIMEZONE = process.env.APP_TIMEZONE?.trim() || "Europe/Paris";

/** Date du jour dans le fuseau de l'équipe. */
export function todayISO(timeZone: string = APP_TIMEZONE): string {
  // Le format en-CA produit directement "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** Lundi de la semaine (semaine du lundi au dimanche). */
export function startOfWeekISO(iso: string): string {
  const day = parse(iso).getUTCDay(); // 0 = dimanche
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

/**
 * Même jour, `months` mois plus tard (ou plus tôt), ramené au dernier jour du mois si besoin :
 * 31 janvier + 1 mois → 28 février.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toISO(target);
}

/** Premier jour du mois. */
export const startOfMonthISO = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Dernier jour du mois. */
export const endOfMonthISO = (iso: string) => addDays(addMonths(startOfMonthISO(iso), 1), -1);

/** Dimanche de la semaine en cours (semaine du lundi au dimanche). */
export function endOfWeekISO(iso: string): string {
  const day = parse(iso).getUTCDay(); // 0 = dimanche
  return addDays(iso, day === 0 ? 0 : 7 - day);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
}

const shortFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthYearFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLongFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const weekdayShortFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });

/** "septembre 2026" */
export function formatMonthYear(iso: string): string {
  return monthYearFmt.format(parse(iso));
}

/** "jeudi 24 septembre 2026" */
export function formatDayLong(iso: string): string {
  return dayLongFmt.format(parse(iso));
}

/** "jeu." */
export function formatWeekdayShort(iso: string): string {
  return weekdayShortFmt.format(parse(iso));
}

/** "12 oct." */
export function formatShort(iso: string): string {
  return shortFmt.format(parse(iso));
}

const weekdayDayMonthFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "jeu. 12 mars" */
export function formatWeekdayDayMonth(iso: string): string {
  return weekdayDayMonthFmt.format(parse(iso));
}

/** Compte à rebours jusqu'à `iso` : "aujourd'hui", "demain", "dans 5 jours", "hier", "il y a 3 jours". */
export function formatCountdown(iso: string, today: string): string {
  const days = diffDays(iso, today);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  return days > 0 ? `dans ${days} jours` : `il y a ${-days} jours`;
}

/** "12 oct. 2026" */
export function formatLong(iso: string): string {
  return longFmt.format(parse(iso));
}

/**
 * "12 oct. 2026 à 14:32" pour un instant précis (ISO complet), dans le fuseau de l'équipe.
 * À appeler côté serveur : APP_TIMEZONE n'est pas exposé au navigateur.
 */
export function formatDateTime(isoInstant: string, timeZone: string = APP_TIMEZONE): string {
  const date = new Date(isoInstant);
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
  return `${day} à ${time}`;
}

/** Échéance lisible relative à aujourd'hui : "Aujourd'hui", "Demain", "Hier", "Jeudi", "12 oct.". */
export function formatDue(iso: string, today: string): string {
  const diff = diffDays(iso, today);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  if (diff > 1 && diff < 7) {
    const w = weekdayFmt.format(parse(iso));
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return formatShort(iso);
}

/** Durée lisible : "45 s", "12 min", "3 h 05". */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return `${Math.max(0, Math.floor(ms / 1000))} s`;
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)} h ${String(totalMin % 60).padStart(2, "0")}`;
}

/** Chrono : "0:04:09", "12:30:00". */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** "14:32" pour un instant précis, dans le fuseau de l'équipe (à appeler côté serveur). */
export function formatTime(isoInstant: string, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(isoInstant));
}

/** Écart (ms) entre l'heure affichée dans `timeZone` et l'heure UTC, à l'instant donné. */
function timeZoneOffset(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, Number(p.value)]),
  );
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return shown - Math.floor(instant / 1000) * 1000;
}

/**
 * Instant correspondant à une date "YYYY-MM-DD" et une heure "HH:MM" lues dans le fuseau de
 * l'équipe (saisie manuelle d'une période de travail). Changement d'heure compris.
 */
export function zonedInstant(isoDate: string, time: string, timeZone: string = APP_TIMEZONE): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Deux passes : l'écart peut changer entre l'estimation et le résultat (changement d'heure).
  const first = wall - timeZoneOffset(wall, timeZone);
  return new Date(wall - timeZoneOffset(first, timeZone));
}

/** Date "YYYY-MM-DD" et heure "HH:MM" d'un instant, dans le fuseau de l'équipe (à appeler côté serveur). */
export function zonedParts(isoInstant: string, timeZone: string = APP_TIMEZONE): { date: string; time: string } {
  const date = new Date(isoInstant);
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone }).format(date),
    time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date),
  };
}
