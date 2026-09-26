import { requireUser } from "@/lib/auth";
import { redirectToSelectedProject } from "@/lib/selected-project";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Ancienne adresse des journées importantes : celles du projet sélectionné. */
export default async function ImportantDaysRedirect({ searchParams }: Props) {
  const me = await requireUser();
  return redirectToSelectedProject(me.id, "calendrier/journees", await searchParams);
}
