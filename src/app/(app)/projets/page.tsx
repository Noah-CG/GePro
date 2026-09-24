import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectCard } from "@/components/projects/project-card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getProjectsWithStats } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Projets" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archives?: string }> }) {
  await requireUser();
  const archived = (await searchParams).archives === "1";
  const projects = await getProjectsWithStats({ archived, today: todayISO() });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Projets"
        subtitle={archived ? "Projets archivés" : `${projects.length} projet${projects.length > 1 ? "s" : ""} actif${projects.length > 1 ? "s" : ""}`}
        actions={<NewProjectButton />}
      />

      <div className="mb-5 flex gap-1 text-sm">
        <Link href="/projets" className={cn("rounded-lg px-3 py-1.5", !archived ? "bg-surface-2 font-medium" : "text-muted hover:text-text")}>
          Actifs
        </Link>
        <Link href="/projets?archives=1" className={cn("rounded-lg px-3 py-1.5", archived ? "bg-surface-2 font-medium" : "text-muted hover:text-text")}>
          Archivés
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban size={28} />} title={archived ? "Aucun projet archivé" : "Aucun projet pour l'instant"}>
          {!archived && "Créez votre premier projet avec le bouton ci-dessus ou la touche P."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
