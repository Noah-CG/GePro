import { requireUser } from "@/lib/auth";
import { redirectToSelectedProject } from "@/lib/selected-project";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Ancienne adresse du calendrier (et retour de Google Agenda) : celui du projet sélectionné. */
export default async function CalendarRedirect({ searchParams }: Props) {
  const me = await requireUser();
  return redirectToSelectedProject(me.id, "calendrier", await searchParams);
}
