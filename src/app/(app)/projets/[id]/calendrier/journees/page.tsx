import type { Metadata } from "next";
import { ImportantDaysList } from "@/components/calendar/important-days-list";
import { todayISO } from "@/lib/dates";
import { loadProjectPage } from "@/lib/project-page";
import { getImportantDays } from "@/lib/queries";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project } = await loadProjectPage((await params).id);
  return { title: `Journées importantes · ${project.name}` };
}

/** Toutes les journées importantes d'un projet : à venir, puis passées. */
export default async function ImportantDaysPage({ params }: Props) {
  const { project } = await loadProjectPage((await params).id);
  const days = await getImportantDays(project.id);
  return <ImportantDaysList projectId={project.id} projectName={project.name} days={days} today={todayISO()} />;
}
