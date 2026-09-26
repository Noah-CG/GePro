import { requireUser } from "@/lib/auth";
import { redirectToSelectedProject } from "@/lib/selected-project";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Ancienne page « Toutes les tâches » : les tâches du projet sélectionné, filtres gardés. */
export default async function TasksPage({ searchParams }: Props) {
  const me = await requireUser();
  return redirectToSelectedProject(me.id, "", await searchParams);
}
