"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { calendarHref, groupByDay, isSameMonth, monthWeeks, periodTitle, shiftPeriod, weekDays, type CalendarView as View } from "@/lib/calendar";
import type { CalendarEvent, CalendarItems } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { MonthGrid, WeekGrid } from "./calendar-grid";
import { DayList } from "./day-list";
import { EventDialog } from "./event-dialog";

/** Événement en cours de création (date) ou de modification (événement). */
type EventTarget = { date: string; event?: CalendarEvent } | null;

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
  projectName,
}: {
  view: View;
  date: string;
  today: string;
  items: CalendarItems;
  projectName: string | null;
}) {
  const { editTask } = useApp();
  const [eventTarget, setEventTarget] = useState<EventTarget>(null);
  const itemsByDay = useMemo(() => groupByDay(items), [items]);

  const handlers = {
    onCreate: (day: string) => setEventTarget({ date: day }),
    onOpenTask: editTask,
    onOpenEvent: (event: CalendarEvent) => setEventTarget({ date: event.date, event }),
  };
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
