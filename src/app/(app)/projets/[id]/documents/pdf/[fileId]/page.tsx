import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileActions } from "@/components/files/file-actions";
import { PdfIcon } from "@/components/files/pdf-icon";
import { PdfViewer } from "@/components/files/pdf-viewer";
import { atLeast, requireProjectAccess } from "@/lib/access";
import { getProjectFile } from "@/lib/queries";
import { isUuid } from "@/lib/validation";

type Props = { params: Promise<{ id: string; fileId: string }> };

/** Fichier d'un projet dont on est membre (sinon 404). */
async function loadFile({ id, fileId }: { id: string; fileId: string }) {
  const access = await requireProjectAccess(id);
  const file = isUuid(fileId) ? await getProjectFile(id, fileId) : null;
  return file ? { ...access, file } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadFile(await params);
  return { title: found?.file.title ?? "PDF" };
}

/** Lecture d'un PDF importé, en lecture seule, dans le lecteur de GePro. */
export default async function PdfDocumentPage({ params }: Props) {
  const found = await loadFile(await params);
  if (!found) notFound();
  const { file, user: me, role } = found;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/projets/${file.projectId}/documents`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> Documents
      </Link>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <PdfIcon size={20} className="shrink-0" />
            <span className="truncate">{file.title}</span>
          </h1>
          <p className="mt-1 text-xs text-muted">
            Lecture seule · {file.sizeLabel} · importé le {file.uploadedLabel}
            {file.uploadedByName && ` par ${file.uploadedByName}`}
          </p>
        </div>
        <FileActions
          fileId={file.id}
          projectId={file.projectId}
          name={file.name}
          canDelete={atLeast(role, "admin") || file.uploadedBy === me.id}
        />
      </header>

      {/* La clé repart d'un lecteur neuf si l'onglet passe d'un PDF à un autre. */}
      <PdfViewer key={file.id} src={`/api/fichiers/${file.id}`} />
    </div>
  );
}
