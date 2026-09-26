import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import { ImportantDaysList } from "@/components/calendar/important-days-list";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getImportantDays } from "@/lib/queries";
import { getSelectedProject } from "@/lib/selected-project";

export const metadata: Metadata = { title: "Journées importantes" };

/** Toutes les journées importantes du projet sélectionné : à venir, puis passées. */
export default async function ImportantDaysPage() {
  await requireUser();
  const project = await getSelectedProject();
  if (!project) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Journées importantes" />
        <EmptyState icon={<FolderKanban size={28} />} title="Aucun projet pour l'instant">
          Les journées importantes appartiennent à un projet : créez-en un d&apos;abord.
        </EmptyState>
      </div>
    );
  }
  const days = await getImportantDays(project.id);
  return <ImportantDaysList projectId={project.id} projectName={project.name} days={days} today={todayISO()} />;
}
