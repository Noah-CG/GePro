import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { GoogleCalendarSync } from "@/components/calendar/google-calendar-sync";
import { requireUser } from "@/lib/auth";
import { readCalendarParams, visibleRange } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { getCalendarSyncView, reconcileIfStale } from "@/lib/integrations/calendar-sync";
import { getCalendarItems } from "@/lib/queries";
import { getSelectedProject } from "@/lib/selected-project";

export const metadata: Metadata = { title: "Calendrier" };
// La synchronisation complète avec Google Agenda (réglages, « Synchroniser maintenant ») peut
// prendre plusieurs secondes quand il y a beaucoup d'éléments.
export const maxDuration = 60;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Calendrier du projet sélectionné : échéances des tâches et événements (plus les événements
 * d'équipe), en vue Mois ou Semaine. ?vue=mois|semaine&date=YYYY-MM-DD rend la page partageable.
 */
export default async function CalendarPage({ searchParams }: Props) {
  const me = await requireUser();
  const today = todayISO();
  const params = await searchParams;
  const { view, date } = readCalendarParams(params, today);
  const project = await getSelectedProject();
  const [items, syncView] = await Promise.all([
    getCalendarItems({ ...visibleRange(view, date), projectId: project?.id ?? null }),
    getCalendarSyncView(me.id),
  ]);
  // Rattrapage en arrière-plan (après la réponse) si la dernière synchronisation complète est ancienne.
  await reconcileIfStale(me.id);

  const google = typeof params.google === "string" ? params.google : null;
  const reason = typeof params.reason === "string" ? params.reason : null;
  return (
    <CalendarView
      view={view}
      date={date}
      today={today}
      items={items}
      projectId={project?.id ?? null}
      projectName={project?.name ?? null}
      sync={<GoogleCalendarSync view={syncView} google={google} reason={reason} />}
    />
  );
}
