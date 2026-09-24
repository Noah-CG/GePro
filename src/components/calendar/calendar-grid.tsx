"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { calendarHref, dayAriaLabel, isSameMonth, monthWeeks, periodTitle, shiftPeriod, weekDays, type CalendarView, type DayItems } from "@/lib/calendar";
import { addDays, endOfWeekISO, formatDayLong, formatWeekdayShort, startOfWeekISO } from "@/lib/dates";
import type { CalendarEvent, TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EventChip, TaskChip } from "./calendar-items";

export type GridHandlers = {
  /** Clic sur une zone vide d'un jour (ou Entrée) : créer un événement à cette date. */
  onCreate: (day: string) => void;
  onOpenTask: (task: TaskView) => void;
  onOpenEvent: (event: CalendarEvent) => void;
};

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * Navigation clavier dans la grille (un seul arrêt de tabulation, comme le motif « grid » de
 * l'ARIA) : flèches pour changer de jour, Début / Fin pour le lundi / dimanche, Page préc. /
 * suiv. pour la période voisine, Entrée ou Espace pour créer un événement. Aller au-delà des
 * jours affichés charge la période correspondante et y garde le focus.
 */
export function useGridNavigation({ view, days, date, today, onCreate }: { view: CalendarView; days: string[]; date: string; today: string; onCreate: (day: string) => void }) {
  const router = useRouter();
  const visible = useMemo(() => new Set(days), [days]);
  const [active, setActive] = useState(() => (visible.has(today) && (view === "semaine" || isSameMonth(today, date)) ? today : date));
  const cells = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef(false);

  // Période changée par les liens de l'en-tête : le jour actif revient dans la grille affichée.
  const current = visible.has(active) ? active : date;

  useEffect(() => {
    if (!pendingFocus.current || !visible.has(active)) return;
    pendingFocus.current = false;
    cells.current.get(active)?.focus();
  }, [active, visible]);

  function moveTo(day: string) {
    setActive(day);
    if (visible.has(day)) return cells.current.get(day)?.focus();
    pendingFocus.current = true;
    router.push(calendarHref(view, day), { scroll: false });
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>, day: string) {
    // Touches pressées sur une tâche ou un événement : comportement normal des boutons.
    if (e.target !== e.currentTarget) return;
    let target: string | null = null;
    if (e.key in ARROWS) target = addDays(day, ARROWS[e.key]);
    else if (e.key === "Home") target = startOfWeekISO(day);
    else if (e.key === "End") target = endOfWeekISO(day);
    else if (e.key === "PageUp") target = shiftPeriod(view, day, -1);
    else if (e.key === "PageDown") target = shiftPeriod(view, day, 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return onCreate(day);
    }
    if (!target) return;
    e.preventDefault();
    moveTo(target);
  }

  const cellProps = (day: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) cells.current.set(day, el);
      else cells.current.delete(day);
    },
    tabIndex: day === current ? 0 : -1,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, day),
    onFocus: () => setActive(day),
  });

  return { active: current, cellProps };
}

/** Numéro du jour, dans une pastille d'accent pour aujourd'hui. */
export function DayNumber({ day, today, muted }: { day: string; today: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        // self-start : dans la case (colonne flex), la pastille garde sa taille au lieu de s'étirer.
        "flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1 text-xs tabular-nums",
        day === today ? "bg-accent font-semibold text-accent-fg" : muted ? "text-muted" : "text-text",
      )}
    >
      {Number(day.slice(8))}
    </span>
  );
}

/** Liste des éléments d'un jour : événements puis tâches, au plus `max` (reste : « +N autres »). */
export function DayItemsList({
  items,
  max,
  tabIndex,
  moreHref,
  onOpenTask,
  onOpenEvent,
}: {
  items: DayItems | undefined;
  max?: number;
  tabIndex: number;
  moreHref?: string;
  onOpenTask: GridHandlers["onOpenTask"];
  onOpenEvent: GridHandlers["onOpenEvent"];
}) {
  const all = [
    ...(items?.events ?? []).map((event) => ({ key: `e-${event.id}`, node: <EventChip event={event} tabIndex={tabIndex} onOpen={onOpenEvent} /> })),
    ...(items?.tasks ?? []).map((task) => ({ key: `t-${task.id}`, node: <TaskChip task={task} tabIndex={tabIndex} onOpen={onOpenTask} /> })),
  ];
  const shown = max === undefined ? all : all.slice(0, max);
  const hidden = all.length - shown.length;
  if (all.length === 0) return null;

  return (
    <>
      <ul className="flex min-w-0 flex-col gap-0.5">
        {shown.map((item) => (
          <li key={item.key} className="min-w-0">
            {item.node}
          </li>
        ))}
      </ul>
      {hidden > 0 && moreHref && (
        <Link
          href={moreHref}
          tabIndex={tabIndex}
          onClick={(e) => e.stopPropagation()}
          className="self-start rounded px-1 text-xs font-medium text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          +{hidden} autre{hidden > 1 ? "s" : ""}
        </Link>
      )}
    </>
  );
}

/** En-tête des colonnes : "lun." … "dim." (nom complet pour les lecteurs d'écran). */
function WeekdayHeader({ week }: { week: string[] }) {
  return (
    <div role="row" className="grid grid-cols-7 border-b border-border bg-surface-2/50">
      {week.map((day) => (
        <div key={day} role="columnheader" aria-label={formatDayLong(day).split(" ")[0]} className="px-2 py-1.5 text-xs font-medium text-muted capitalize">
          {formatWeekdayShort(day)}
        </div>
      ))}
    </div>
  );
}

/** Vue Mois : 7 colonnes, semaines du lundi au dimanche, jours hors du mois atténués. */
export function MonthGrid({
  date,
  today,
  itemsByDay,
  onCreate,
  onOpenTask,
  onOpenEvent,
}: { date: string; today: string; itemsByDay: Map<string, DayItems> } & GridHandlers) {
  const weeks = useMemo(() => monthWeeks(date), [date]);
  const days = useMemo(() => weeks.flat(), [weeks]);
  const { active, cellProps } = useGridNavigation({ view: "mois", days, date, today, onCreate });

  return (
    <div role="grid" aria-label={`Calendrier de ${periodTitle("mois", date)}`} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <WeekdayHeader week={weeks[0]} />
      <div role="rowgroup" className="flex min-h-0 flex-1 flex-col gap-px bg-border">
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid min-h-24 flex-1 grid-cols-7 gap-px">
            {week.map((day) => {
              const inMonth = isSameMonth(day, date);
              const items = itemsByDay.get(day);
              const tabIndex = day === active ? 0 : -1;
              return (
                <div
                  key={day}
                  role="gridcell"
                  aria-label={dayAriaLabel(day, today, items)}
                  aria-current={day === today ? "date" : undefined}
                  {...cellProps(day)}
                  onClick={() => onCreate(day)}
                  className={cn(
                    "flex min-h-0 min-w-0 cursor-pointer flex-col gap-1 overflow-hidden p-1.5 outline-none",
                    "focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                    inMonth ? "bg-surface hover:bg-surface-2/60" : "bg-bg text-muted hover:bg-surface-2/40",
                  )}
                >
                  <DayNumber day={day} today={today} muted={!inMonth} />
                  <div className={cn("flex min-h-0 flex-col gap-0.5", !inMonth && "opacity-70")}>
                    <DayItemsList
                      items={items}
                      max={3}
                      tabIndex={tabIndex}
                      moreHref={calendarHref("semaine", day)}
                      onOpenTask={onOpenTask}
                      onOpenEvent={onOpenEvent}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vue Semaine : 7 colonnes hautes, tout le contenu de chaque jour est visible (la colonne défile). */
export function WeekGrid({
  date,
  today,
  itemsByDay,
  onCreate,
  onOpenTask,
  onOpenEvent,
}: { date: string; today: string; itemsByDay: Map<string, DayItems> } & GridHandlers) {
  const days = useMemo(() => weekDays(date), [date]);
  const { active, cellProps } = useGridNavigation({ view: "semaine", days, date, today, onCreate });

  return (
    <div role="grid" aria-label={`Calendrier de la semaine du ${periodTitle("semaine", date)}`} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <WeekdayHeader week={days} />
      <div role="row" className="grid min-h-0 flex-1 grid-cols-7 gap-px bg-border">
        {days.map((day) => {
          const items = itemsByDay.get(day);
          return (
            <div
              key={day}
              role="gridcell"
              aria-label={dayAriaLabel(day, today, items)}
              aria-current={day === today ? "date" : undefined}
              {...cellProps(day)}
              onClick={() => onCreate(day)}
              className={cn(
                "scroll-thin flex min-h-0 min-w-0 cursor-pointer flex-col gap-1.5 overflow-y-auto bg-surface p-2 outline-none hover:bg-surface-2/60",
                "focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
              )}
            >
              <DayNumber day={day} today={today} />
              <DayItemsList items={items} tabIndex={day === active ? 0 : -1} onOpenTask={onOpenTask} onOpenEvent={onOpenEvent} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
