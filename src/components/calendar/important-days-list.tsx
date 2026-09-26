"use client";

import { CalendarDays, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader, Section } from "@/components/ui/misc";
import { calendarHref } from "@/lib/calendar";
import { formatCountdown, formatWeekdayDayMonth } from "@/lib/dates";
import type { ImportantDayView } from "@/lib/queries";
import { ImportantDayDialog } from "./important-day-dialog";

/** Journée en cours de création (sans \`day\`) ou de modification. */
type Target = { day?: ImportantDayView } | null;

/**
 * Page « Journées importantes » : toutes celles du projet, à venir puis passées. Un clic sur une
 * journée l'ouvre pour la modifier ou la retirer ; « Voir » ouvre le calendrier à sa date.
 */
export function ImportantDaysList({ projectId, projectName, days, today }: { projectId: string; projectName: string; days: ImportantDayView[]; today: string }) {
  const [target, setTarget] = useState<Target>(null);
  const upcoming = days.filter((d) => d.date >= today);
  // Les plus récentes d'abord.
  const past = days.filter((d) => d.date < today).reverse();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Journées importantes"
        subtitle={projectName}
        actions={
          <>
            <Link href={calendarHref("mois", today)} className={buttonClass({ size: "sm", variant: "ghost" })}>
              <CalendarDays size={14} /> Calendrier
            </Link>
            <Button variant="primary" size="sm" onClick={() => setTarget({})}>
              <Plus size={14} /> Ajouter
            </Button>
          </>
        }
      />

      {days.length === 0 ? (
        <EmptyState icon={<Star size={28} />} title="Aucune journée importante">
          Marquez une date depuis le calendrier (clic sur un jour) ou avec le bouton « Ajouter ».
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <DaySection title="À venir" days={upcoming} today={today} onOpen={(day) => setTarget({ day })} empty="Aucune journée importante à venir." />
          {past.length > 0 && <DaySection title="Passées" days={past} today={today} onOpen={(day) => setTarget({ day })} />}
        </div>
      )}

      <ImportantDayDialog
        key={target ? (target.day?.id ?? "nouvelle") : "fermee"}
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        projectId={projectId}
        date={today}
        pickDate
        day={target?.day}
      />
    </div>
  );
}

function DaySection({
  title,
  days,
  today,
  onOpen,
  empty,
}: {
  title: string;
  days: ImportantDayView[];
  today: string;
  onOpen: (day: ImportantDayView) => void;
  empty?: string;
}) {
  return (
    <Section title={title} count={days.length}>
      {days.length === 0 && empty && <p className="p-4 text-sm text-muted">{empty}</p>}
      <ul className="divide-y divide-border empty:hidden">
        {days.map((day) => (
          <li key={day.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: day.color }}>
              <Star size={13} className="fill-current" aria-hidden />
            </span>
            <button type="button" onClick={() => onOpen(day)} className="min-w-0 flex-1 text-left" aria-label={`Modifier « ${day.title} »`}>
              <p className="truncate text-sm font-medium hover:text-accent">{day.title}</p>
              <p className="text-xs text-muted">
                {formatWeekdayDayMonth(day.date)} {day.date.slice(0, 4)} · {formatCountdown(day.date, today)}
              </p>
              {day.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{day.description}</p>}
            </button>
            <Link href={calendarHref("mois", day.date)} className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text">
              Voir
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
