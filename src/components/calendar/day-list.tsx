"use client";

import { CalendarDays, Plus } from "lucide-react";
import type { DayItems } from "@/lib/calendar";
import { formatDayLong } from "@/lib/dates";
import { EmptyState } from "@/components/ui/misc";
import { DayItemsList, type GridHandlers } from "./calendar-grid";

/**
 * Affichage mobile (moins de 768 px) : liste verticale des jours qui ont du contenu, chacun
 * avec ses événements et ses tâches, et un bouton pour y ajouter un événement.
 */
export function DayList({
  days,
  today,
  itemsByDay,
  emptyTitle,
  onCreate,
  onOpenTask,
  onOpenEvent,
}: { days: string[]; today: string; itemsByDay: Map<string, DayItems>; emptyTitle: string } & GridHandlers) {
  const filled = days.filter((day) => itemsByDay.has(day));
  if (filled.length === 0) {
    return (
      <EmptyState icon={<CalendarDays size={28} />} title={emptyTitle}>
        Ajoutez un événement avec le bouton « Nouvel événement ».
      </EmptyState>
    );
  }

  return (
    <ol className="space-y-4">
      {filled.map((day) => (
        <li key={day} aria-current={day === today ? "date" : undefined}>
          <div className="mb-1.5 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold first-letter:uppercase">
              {formatDayLong(day)}
              {day === today && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Aujourd&apos;hui</span>}
            </h2>
            <button
              type="button"
              onClick={() => onCreate(day)}
              aria-label={`Ajouter un événement le ${formatDayLong(day)}`}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-2">
            <DayItemsList items={itemsByDay.get(day)} tabIndex={0} onOpenTask={onOpenTask} onOpenEvent={onOpenEvent} />
          </div>
        </li>
      ))}
    </ol>
  );
}
