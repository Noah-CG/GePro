"use client";

import { Plus, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ImportantDayDialog } from "@/components/calendar/important-day-dialog";
import { Section } from "@/components/ui/misc";
import { calendarHref } from "@/lib/calendar";
import { diffDays, formatCountdown, formatWeekdayDayMonth } from "@/lib/dates";
import type { ImportantDayView } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Nombre de jours pendant lesquels une journée à venir est mise en avant. */
const SOON_DAYS = 7;

/**
 * Tableau de bord : prochaines journées importantes du projet (5 au plus), avec compte à rebours.
 * Une journée des 7 prochains jours est mise en avant ; un clic ouvre le calendrier à sa date.
 */
export function ImportantDaysWidget({ projectId, days, today }: { projectId: string; days: ImportantDayView[]; today: string }) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="Journées importantes"
      count={days.length}
      action={
        <Link href={`/projets/${projectId}/calendrier/journees`} className="text-xs text-muted hover:text-text">
          Tout voir
        </Link>
      }
    >
      {days.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
          <p className="text-sm text-muted">Aucune journée importante à venir.</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-sm font-medium hover:bg-surface-2"
          >
            <Plus size={14} /> Ajouter une journée importante
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {days.map((day) => {
            const soon = diffDays(day.date, today) < SOON_DAYS;
            return (
              <li key={day.id}>
                <Link
                  href={calendarHref(projectId, "mois", day.date)}
                  className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60", soon && "bg-danger-soft/40")}
                  title={day.description || undefined}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: day.color }}>
                    <Star size={12} className="fill-current" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", soon && "font-semibold")}>{day.title}</p>
                    <p className="text-xs text-muted">{formatWeekdayDayMonth(day.date)}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
                      soon ? "font-semibold text-white" : "bg-surface-2 text-muted",
                    )}
                    style={soon ? { background: day.color } : undefined}
                  >
                    {formatCountdown(day.date, today)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ImportantDayDialog
        key={adding ? "ouverte" : "fermee"}
        open={adding}
        onOpenChange={setAdding}
        projectId={projectId}
        date={today}
        pickDate
      />
    </Section>
  );
}
