/**
 * Mise en forme du fil de messages : séparateurs de jour et regroupement des messages
 * consécutifs d'un même auteur (sans répéter avatar ni nom), comme dans Discord.
 */
import type { DiscordMessage } from "./model";

/** Deux messages du même auteur espacés de moins de 5 minutes sont regroupés. */
export const GROUP_WINDOW_MS = 5 * 60_000;

export type ThreadRow =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: DiscordMessage; grouped: boolean };

/**
 * Clé d'auteur : les messages d'un webhook partagent son id quel que soit le pseudo affiché,
 * le nom départage donc deux membres qui écrivent depuis GePro.
 */
const authorKey = (m: DiscordMessage) => `${m.author.id}:${m.author.name}`;

/** Jour calendaire "YYYY-MM-DD" d'un instant, dans le fuseau donné (celui du navigateur par défaut). */
export function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** « Aujourd'hui », « Hier » ou « lundi 22 septembre 2026 ». */
export function dayLabel(date: Date, now: Date, timeZone?: string): string {
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return "Aujourd'hui";
  if (key === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function buildThread(messages: readonly DiscordMessage[], now: Date, timeZone?: string): ThreadRow[] {
  const rows: ThreadRow[] = [];
  let previous: DiscordMessage | null = null;
  for (const message of messages) {
    const date = new Date(message.timestamp);
    const day = dayKey(date, timeZone);
    const newDay = !previous || dayKey(new Date(previous.timestamp), timeZone) !== day;
    if (newDay) rows.push({ kind: "day", key: `day-${day}`, label: dayLabel(date, now, timeZone) });
    const grouped =
      !newDay &&
      previous !== null &&
      authorKey(previous) === authorKey(message) &&
      date.getTime() - new Date(previous.timestamp).getTime() < GROUP_WINDOW_MS;
    rows.push({ kind: "message", key: message.id, message, grouped });
    previous = message;
  }
  return rows;
}
