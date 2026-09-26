import { requireUser } from "@/lib/auth";
import { redirectToSelectedProject } from "@/lib/selected-project";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Ancienne adresse du temps de travail : la page Temps du projet sélectionné. */
export default async function TimeRedirect({ searchParams }: Props) {
  const me = await requireUser();
  return redirectToSelectedProject(me.id, "temps", await searchParams);
}
