"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { calendarHref, groupByDay, isSameMonth, monthWeeks, periodTitle, shiftPeriod, weekDays, type CalendarView as View } from "@/lib/calendar";
import { formatDayLong } from "@/lib/dates";
import type { CalendarEvent, CalendarItems, ImportantDayView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { MonthGrid, WeekGrid } from "./calendar-grid";
import { DayList } from "./day-list";
import { EventDialog } from "./event-dialog";
import { ImportantDayDialog } from "./important-day-dialog";

/** Événement en cours de création (date) ou de modification (événement). */
type EventTarget = { date: string; event?: CalendarEvent } | null;
/** Journée importante en cours de création (date) ou de modification. */
type ImportantTarget = { date: string; day?: ImportantDayView } | null;
/** Menu des actions d'un jour, placé contre `anchor` (point cliqué ou case du jour). */
type DayMenuState = { day: string; anchor: DOMRect } | null;

/**
 * Page Calendrier : en-tête (période, navigation), grille (ordinateur) ou liste des jours
 * (mobile). Les tâches s'ouvrent dans le TaskDialog existant ; un clic sur une zone vide d'un
 * jour, ou sur un événement, ouvre la fenêtre d'événement.
 */
export function CalendarView({
  view,
  date,
  today,
  items,
  projectId,
  projectName,
  sync,
}: {
  view: View;
  date: string;
  today: string;
  items: CalendarItems;
  /** Projet sélectionné : sans projet, pas de journées importantes (elles appartiennent à un projet). */
  projectId: string | null;
  projectName: string | null;
  /** Bouton de synchronisation avec Google Agenda, affiché dans l'en-tête. */
  sync?: ReactNode;
}) {
  const { editTask } = useApp();
  const [eventTarget, setEventTarget] = useState<EventTarget>(null);
  const [importantTarget, setImportantTarget] = useState<ImportantTarget>(null);
  const [menu, setMenu] = useState<DayMenuState>(null);
  const itemsByDay = useMemo(() => groupByDay(items), [items]);

  const handlers = {
    // Sans projet sélectionné, seule la création d'un événement est possible : pas de menu.
    onCreate: (day: string, anchor: DOMRect) => (projectId ? setMenu({ day, anchor }) : setEventTarget({ date: day })),
    onOpenTask: editTask,
    onOpenEvent: (event: CalendarEvent) => setEventTarget({ date: event.date, event }),
    onOpenImportantDay: (day: ImportantDayView) => setImportantTarget({ date: day.date, day }),
  };
  const menuImportant = menu ? itemsByDay.get(menu.day)?.importantDay : undefined;
  const unit = view === "mois" ? "Mois" : "Semaine";
  // Mois : les jours du mois seulement (la grille déborde sur les mois voisins).
  const visibleDays = useMemo(() => (view === "mois" ? monthWeeks(date).flat().filter((day) => isSameMonth(day, date)) : weekDays(date)), [view, date]);

  return (
    <div className="flex flex-col md:h-[calc(100dvh-6.5rem)]">
      <PageHeader
        title={<span className="first-letter:uppercase">{periodTitle(view, date)}</span>}
        subtitle={projectName ? `Calendrier · ${projectName}` : "Calendrier de l'équipe"}
        actions={
          <>
            <nav aria-label="Période" className="flex items-center gap-1">
              <Link href={calendarHref(view, shiftPeriod(view, date, -1))} aria-label={`${unit} précédent${view === "semaine" ? "e" : ""}`} className={buttonClass({ size: "icon", variant: "ghost" })}>
                <ChevronLeft size={16} />
              </Link>
              <Link href={calendarHref(view, today)} className={buttonClass({ size: "sm" })}>
                Aujourd&apos;hui
              </Link>
              <Link href={calendarHref(view, shiftPeriod(view, date, 1))} aria-label={`${unit} suivant${view === "semaine" ? "e" : ""}`} className={buttonClass({ size: "icon", variant: "ghost" })}>
                <ChevronRight size={16} />
              </Link>
            </nav>
            <nav aria-label="Vue" className="flex rounded-lg border border-border bg-surface p-0.5">
              {(
                [
                  { value: "mois", label: "Mois" },
                  { value: "semaine", label: "Semaine" },
                ] as const
              ).map((v) => (
                <Link
                  key={v.value}
                  href={calendarHref(v.value, date)}
                  aria-current={view === v.value ? "page" : undefined}
                  className={cn(
                    "flex h-7 items-center rounded-md px-2.5 text-sm",
                    view === v.value ? "bg-surface-2 font-medium" : "text-muted hover:text-text",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
            {projectId && (
              <Link href="/calendrier/journees" className={buttonClass({ size: "sm", variant: "ghost" })}>
                <Star size={14} /> <span className="hidden lg:inline">Journées importantes</span>
              </Link>
            )}
            {sync}
            <Button variant="primary" size="sm" onClick={() => setEventTarget({ date: visibleDays.includes(today) ? today : date })}>
              <Plus size={14} /> Nouvel événement
            </Button>
          </>
        }
      />

      {/* Ordinateur : grille pleine page */}
      <div className="hidden min-h-0 flex-1 md:flex">
        {view === "mois" ? (
          <MonthGrid date={date} today={today} itemsByDay={itemsByDay} {...handlers} />
        ) : (
          <WeekGrid date={date} today={today} itemsByDay={itemsByDay} {...handlers} />
        )}
      </div>

      {/* Mobile : liste des jours qui ont du contenu (Mois comme Semaine) */}
      <div className="md:hidden">
        <DayList
          days={visibleDays}
          today={today}
          itemsByDay={itemsByDay}
          emptyTitle={view === "mois" ? "Rien de prévu ce mois-ci" : "Rien de prévu cette semaine"}
          {...handlers}
        />
      </div>

      <DayMenu
        state={menu}
        onClose={() => setMenu(null)}
        importantDay={menuImportant}
        onNewEvent={(day) => setEventTarget({ date: day })}
        onImportantDay={(day) => setImportantTarget({ date: day, day: menuImportant })}
      />

      {projectId && (
        <ImportantDayDialog
          key={importantTarget ? (importantTarget.day?.id ?? `nouvelle-${importantTarget.date}`) : "fermee"}
          open={importantTarget !== null}
          onOpenChange={(open) => !open && setImportantTarget(null)}
          projectId={projectId}
          date={importantTarget?.date ?? today}
          day={importantTarget?.day}
        />
      )}

      <EventDialog
        // La clé force un formulaire neuf à chaque ouverture.
        key={eventTarget ? (eventTarget.event?.id ?? `nouveau-${eventTarget.date}`) : "ferme"}
        open={eventTarget !== null}
        onOpenChange={(open) => !open && setEventTarget(null)}
        date={eventTarget?.date ?? today}
        event={eventTarget?.event}
      />
    </div>
  );
}

/**
 * Menu d'un jour du calendrier (clic, clic droit ou Entrée sur une case) : nouvel événement, ou
 * marquer / modifier la journée importante. Ancré sur un rectangle (point cliqué ou case).
 */
function DayMenu({
  state,
  onClose,
  importantDay,
  onNewEvent,
  onImportantDay,
}: {
  state: DayMenuState;
  onClose: () => void;
  importantDay?: ImportantDayView;
  onNewEvent: (day: string) => void;
  onImportantDay: (day: string) => void;
}) {
  const anchor = useMemo(() => ({ current: { getBoundingClientRect: () => state?.anchor ?? new DOMRect() } }), [state]);
  const item = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";
  const choose = (action: (day: string) => void) => () => {
    if (!state) return;
    onClose();
    action(state.day);
  };

  return (
    <Popover.Root open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          aria-label={state ? `Actions du ${formatDayLong(state.day)}` : undefined}
          className="z-50 w-64 rounded-xl border border-border bg-surface p-1 shadow-xl"
        >
          {state && <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted first-letter:uppercase">{formatDayLong(state.day)}</p>}
          <button type="button" className={item} onClick={choose(onNewEvent)}>
            <CalendarClock size={15} className="shrink-0 text-muted" /> Nouvel événement
          </button>
          <button type="button" className={item} onClick={choose(onImportantDay)}>
            <Star size={15} className="shrink-0" style={{ color: importantDay?.color ?? "var(--danger)" }} />
            {importantDay ? "Modifier la journée importante" : "Marquer comme journée importante"}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
