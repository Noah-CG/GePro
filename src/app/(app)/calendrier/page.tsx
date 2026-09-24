import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { requireUser } from "@/lib/auth";
import { readCalendarParams, visibleRange } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { getCalendarItems } from "@/lib/queries";
import { getSelectedProject } from "@/lib/selected-project";

export const metadata: Metadata = { title: "Calendrier" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Calendrier du projet sélectionné : échéances des tâches et événements (plus les événements
 * d'équipe), en vue Mois ou Semaine. ?vue=mois|semaine&date=YYYY-MM-DD rend la page partageable.
 */
export default async function CalendarPage({ searchParams }: Props) {
  await requireUser();
  const today = todayISO();
  const { view, date } = readCalendarParams(await searchParams, today);
  const project = await getSelectedProject();
  const items = await getCalendarItems({ ...visibleRange(view, date), projectId: project?.id ?? null });

  return <CalendarView view={view} date={date} today={today} items={items} projectName={project?.name ?? null} />;
}
