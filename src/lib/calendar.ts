/**
 * Calendrier : grilles de jours, intervalle affiché et paramètres d'adresse.
 * Comme partout dans l'app, un jour est une chaîne "YYYY-MM-DD" (voir lib/dates.ts) ; les
 * semaines vont du lundi au dimanche.
 */
import { addDays, addMonths, endOfMonthISO, endOfWeekISO, formatDayLong, formatMonthYear, formatShort, startOfMonthISO, startOfWeekISO } from "./dates";
import type { CalendarEvent, ImportantDayView, TaskView } from "./queries";

export type CalendarView = "mois" | "semaine";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Vraie date "YYYY-MM-DD" (refuse un 31 septembre ou un mois 13). */
function isValidDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Vue et date lues dans l'adresse (?vue=mois&date=2026-09-24) ; par défaut : le mois d'aujourd'hui. */
export function readCalendarParams(params: { vue?: string | string[]; date?: string | string[] }, today: string) {
  const vue = typeof params.vue === "string" ? params.vue : "";
  const date = typeof params.date === "string" ? params.date : "";
  return {
    view: (vue === "semaine" ? "semaine" : "mois") as CalendarView,
    date: isValidDay(date) ? date : today,
  };
}

export const calendarHref = (view: CalendarView, date: string) => `/calendrier?vue=${view}&date=${date}`;

/** Les 7 jours (lundi → dimanche) de la semaine de `date`. */
export function weekDays(date: string): string[] {
  const monday = startOfWeekISO(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Semaines complètes (lundi → dimanche) couvrant le mois de `date` : 4 à 6 lignes de 7 jours,
 * débordant sur les mois voisins pour compléter la première et la dernière semaine.
 */
export function monthWeeks(date: string): string[][] {
  const last = endOfWeekISO(endOfMonthISO(date));
  const weeks: string[][] = [];
  for (let monday = startOfWeekISO(startOfMonthISO(date)); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(weekDays(monday));
  }
  return weeks;
}

/** Premier et dernier jour affichés par la vue : l'intervalle à lire en base. */
export function visibleRange(view: CalendarView, date: string): { from: string; to: string } {
  const days = view === "mois" ? monthWeeks(date).flat() : weekDays(date);
  return { from: days[0], to: days[days.length - 1] };
}

/** Même vue, période précédente (-1) ou suivante (+1). */
export function shiftPeriod(view: CalendarView, date: string, direction: -1 | 1): string {
  return view === "mois" ? addMonths(date, direction) : addDays(date, 7 * direction);
}

export const isSameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/** Titre de la période : "septembre 2026", ou "28 sept. – 4 oct. 2026" pour une semaine. */
export function periodTitle(view: CalendarView, date: string): string {
  if (view === "mois") return formatMonthYear(date);
  const days = weekDays(date);
  return `${formatShort(days[0])} – ${formatShort(days[6])} ${days[6].slice(0, 4)}`;
}

export type DayItems = { tasks: TaskView[]; events: CalendarEvent[]; importantDay?: ImportantDayView };

/**
 * Regroupe tâches, événements et journées importantes par jour. Dans un jour : tâches ouvertes
 * avant les terminées.
 */
export function groupByDay({ tasks, events, importantDays = [] }: { tasks: TaskView[]; events: CalendarEvent[]; importantDays?: ImportantDayView[] }): Map<string, DayItems> {
  const byDay = new Map<string, DayItems>();
  const get = (day: string) => byDay.get(day) ?? byDay.set(day, { tasks: [], events: [] }).get(day)!;
  for (const importantDay of importantDays) get(importantDay.date).importantDay = importantDay;
  for (const event of events) get(event.date).events.push(event);
  for (const task of tasks) if (task.dueDate) get(task.dueDate).tasks.push(task);
  for (const items of byDay.values()) items.tasks.sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
  return byDay;
}

/**
 * Description d'un jour pour les lecteurs d'écran :
 * "jeudi 24 septembre 2026, aujourd'hui, journée importante : Lancement, 2 tâches dont 1 en retard, 1 événement".
 */
export function dayAriaLabel(day: string, today: string, items: DayItems | undefined): string {
  const parts = [formatDayLong(day)];
  if (day === today) parts.push("aujourd'hui");
  if (items?.importantDay) parts.push(`journée importante : ${items.importantDay.title}`);
  const tasks = items?.tasks ?? [];
  const events = items?.events ?? [];
  const overdue = tasks.filter((t) => t.status !== "done" && day < today).length;
  if (tasks.length) parts.push(`${tasks.length} tâche${tasks.length > 1 ? "s" : ""}${overdue ? ` dont ${overdue} en retard` : ""}`);
  if (events.length) parts.push(`${events.length} événement${events.length > 1 ? "s" : ""}`);
  if (!tasks.length && !events.length) parts.push("aucun élément");
  return parts.join(", ");
}
