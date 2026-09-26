import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { GoogleCalendarSync } from "@/components/calendar/google-calendar-sync";
import { readCalendarParams, visibleRange } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { getCalendarSyncView, reconcileIfStale } from "@/lib/integrations/calendar-sync";
import { loadProjectPage } from "@/lib/project-page";
import { getCalendarItems } from "@/lib/queries";

// La synchronisation complète avec Google Agenda (réglages, « Synchroniser maintenant ») peut
// prendre plusieurs secondes quand il y a beaucoup d'éléments.
export const maxDuration = 60;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project } = await loadProjectPage((await params).id);
  return { title: `Calendrier · ${project.name}` };
}

/**
 * Calendrier d'un projet : échéances des tâches et événements du projet, en vue Mois ou Semaine.
 * ?vue=mois|semaine&date=YYYY-MM-DD rend la page partageable.
 */
export default async function CalendarPage({ params: routeParams, searchParams }: Props) {
  const { project, user: me } = await loadProjectPage((await routeParams).id);
  const today = todayISO();
  const params = await searchParams;
  const { view, date } = readCalendarParams(params, today);
  const [items, syncView] = await Promise.all([
    getCalendarItems({ ...visibleRange(view, date), projectId: project.id }),
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
      projectId={project.id}
      projectName={project.name}
      sync={<GoogleCalendarSync view={syncView} google={google} reason={reason} />}
    />
  );
}
