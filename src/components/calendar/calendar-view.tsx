"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { calendarHref, groupByDay, isSameMonth, monthWeeks, periodTitle, shiftPeriod, type CalendarView as View } from "@/lib/calendar";
import type { CalendarEvent, CalendarItems } from "@/lib/queries";
import { MonthGrid } from "./calendar-grid";
import { DayList } from "./day-list";

/** Événement en cours de création (date) ou de modification (événement). */
type EventTarget = { date: string; event?: CalendarEvent } | null;

/**
 * Page Calendrier : en-tête (période, navigation), grille (ordinateur) ou liste des jours
 * (mobile). Les tâches s'ouvrent dans le TaskDialog existant.
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
            <Button variant="primary" size="sm" onClick={() => setEventTarget({ date: isSameMonth(today, date) ? today : date })}>
              <Plus size={14} /> Nouvel événement
            </Button>
          </>
        }
      />

      {/* Ordinateur : grille pleine page */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <MonthGrid date={date} today={today} itemsByDay={itemsByDay} {...handlers} />
      </div>

      {/* Mobile : liste des jours qui ont du contenu */}
      <div className="md:hidden">
        <DayList
          days={monthWeeks(date).flat().filter((day) => isSameMonth(day, date))}
          today={today}
          itemsByDay={itemsByDay}
          emptyTitle="Rien de prévu ce mois-ci"
          {...handlers}
        />
      </div>
    </div>
  );
}
