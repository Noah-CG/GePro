import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectFiles } from "@/components/files/project-files";
import { ProjectDocuments } from "@/components/integrations/project-documents";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { getConnectionView, getProjectFiles, getProjectResources, getProjectsWithStats } from "@/lib/queries";
import { isUuid } from "@/lib/validation";

type Props = { params: Promise<{ id: string }> };

async function loadProject(id: string) {
  if (!isUuid(id)) return null;
  const [project] = await getProjectsWithStats({ id });
  return project ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await loadProject((await params).id);
  return { title: project ? `Documents · ${project.name}` : "Documents" };
}

export default async function ProjectDocumentsPage({ params }: Props) {
  const me = await requireUser();
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const [{ resources, stale }, files, connection] = await Promise.all([
    getProjectResources(id),
    getProjectFiles(id),
    getConnectionView(me.id, "google"),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Documents" subtitle={project.name} />
      <ProjectFiles projectId={project.id} files={files} />
      <ProjectDocuments
        projectId={project.id}
        resources={resources}
        stale={stale}
        googleConfigured={isGoogleConfigured()}
        connection={connection}
      />
    </div>
  );
}
