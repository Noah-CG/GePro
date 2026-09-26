import type { Metadata } from "next";
import { ProjectFiles } from "@/components/files/project-files";
import { ProjectDocuments } from "@/components/integrations/project-documents";
import { PageHeader } from "@/components/ui/misc";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { loadProjectPage } from "@/lib/project-page";
import { getConnectionView, getProjectFiles, getProjectResources } from "@/lib/queries";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project } = await loadProjectPage((await params).id);
  return { title: `Documents · ${project.name}` };
}

export default async function ProjectDocumentsPage({ params }: Props) {
  const { id } = await params;
  const { project, user: me } = await loadProjectPage(id);
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
