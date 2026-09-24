/**
 * Diagramme de Gantt des tâches : calculs purs (période affichée, positions des barres,
 * déplacements), séparés du composant pour être testés.
 *
 * Une tâche occupe les jours de son début à son échéance, inclus. Avec une seule des deux
 * dates, elle occupe ce seul jour ; sans aucune date, elle n'est pas placée sur le diagramme.
 */
import { addDays, diffDays, endOfWeekISO, startOfWeekISO } from "./dates";

/** Jours occupés par une tâche, inclus ("YYYY-MM-DD"). */
export type Span = { start: string; end: string };

/** Échelles de zoom : largeur d'un jour, en pixels. */
export const GANTT_ZOOMS = {
  jour: { label: "Jours", dayWidth: 36 },
  semaine: { label: "Semaines", dayWidth: 16 },
  mois: { label: "Mois", dayWidth: 5 },
} as const;
export type GanttZoom = keyof typeof GANTT_ZOOMS;

/** Jours occupés par une tâche, ou null si elle n'a ni début ni échéance. */
export function taskSpan(task: { startDate: string | null; dueDate: string | null }): Span | null {
  const start = task.startDate ?? task.dueDate;
  const end = task.dueDate ?? task.startDate;
  if (!start || !end) return null;
  // Données incohérentes (saisies avant la validation) : on remet les dates dans l'ordre.
  return start <= end ? { start, end } : { start: end, end: start };
}

/** Marge ajoutée de part et d'autre des tâches, pour pouvoir les déplacer. */
const MARGIN_DAYS = 14;
/** Durée minimale affichée : une tâche isolée ne remplit pas tout l'écran. */
const MIN_DAYS = 8 * 7;

/**
 * Période affichée : toutes les tâches et aujourd'hui, plus une marge, en semaines entières
 * (du lundi au dimanche). Commencer un lundi permet de dessiner la grille avec un motif répété.
 * `minDays` : durée minimale, pour remplir la largeur de l'écran.
 */
export function ganttRange(spans: Span[], today: string, minDays = MIN_DAYS): Span {
  let min = today;
  let max = today;
  for (const s of spans) {
    if (s.start < min) min = s.start;
    if (s.end > max) max = s.end;
  }
  const start = startOfWeekISO(addDays(min, -MARGIN_DAYS));
  let end = endOfWeekISO(addDays(max, MARGIN_DAYS));
  const days = Math.max(minDays, MIN_DAYS);
  if (diffDays(end, start) + 1 < days) end = endOfWeekISO(addDays(start, days - 1));
  return { start, end };
}

/** Nombre de jours d'une période (bornes incluses). */
export const spanDays = (span: Span) => diffDays(span.end, span.start) + 1;

/** Position horizontale d'une barre, en jours depuis le début de la période. */
export function barBox(span: Span, range: Span): { offset: number; days: number } {
  return { offset: diffDays(span.start, range.start), days: spanDays(span) };
}

/** Ce que fait un glissement : déplacer la barre, ou tirer sur son début ou sa fin. */
export type DragMode = "move" | "start" | "end";

/** Période après un glissement de `days` jours. Un bord ne dépasse jamais l'autre. */
export function shiftSpan(span: Span, mode: DragMode, days: number): Span {
  if (mode === "move") return { start: addDays(span.start, days), end: addDays(span.end, days) };
  if (mode === "start") {
    const start = addDays(span.start, days);
    return { start: start > span.end ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, days);
  return { start: span.start, end: end < span.start ? span.start : end };
}

/** Mois couverts par la période, pour l'en-tête : premier jour affiché et nombre de jours. */
export function ganttMonths(range: Span): { key: string; start: string; days: number }[] {
  const months: { key: string; start: string; days: number }[] = [];
  for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
    const key = day.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.days++;
    else months.push({ key, start: day, days: 1 });
  }
  return months;
}

/** Tâches placées sur le diagramme, triées par début puis échéance ; les autres à part. */
export function planTasks<T extends { startDate: string | null; dueDate: string | null; position: number }>(
  tasks: T[],
): { planned: { task: T; span: Span }[]; unplanned: T[] } {
  const planned: { task: T; span: Span }[] = [];
  const unplanned: T[] = [];
  for (const task of tasks) {
    const span = taskSpan(task);
    if (span) planned.push({ task, span });
    else unplanned.push(task);
  }
  planned.sort(
    (a, b) =>
      a.span.start.localeCompare(b.span.start) || a.span.end.localeCompare(b.span.end) || a.task.position - b.task.position,
  );
  return { planned, unplanned };
}
