import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSelectedProjectId } from "@/lib/selected-project";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Ancienne page « Toutes les tâches ». Le site n'affiche plus que le projet sélectionné : on
 * redirige vers ses tâches en gardant les filtres (anciens liens et favoris restent valides).
 */
export default async function TasksPage({ searchParams }: Props) {
  await requireUser();
  const projectId = await getSelectedProjectId();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  redirect(projectId ? `/projets/${projectId}${query.size ? `?${query}` : ""}` : "/projets");
}
