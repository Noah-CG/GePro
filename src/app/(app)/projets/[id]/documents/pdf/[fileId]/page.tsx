import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileActions } from "@/components/files/file-actions";
import { PdfIcon } from "@/components/files/pdf-icon";
import { PdfViewer } from "@/components/files/pdf-viewer";
import { requireUser } from "@/lib/auth";
import { getProjectFile } from "@/lib/queries";
import { isUuid } from "@/lib/validation";

type Props = { params: Promise<{ id: string; fileId: string }> };

async function loadFile({ id, fileId }: { id: string; fileId: string }) {
  if (!isUuid(id) || !isUuid(fileId)) return null;
  return getProjectFile(id, fileId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const file = await loadFile(await params);
  return { title: file?.title ?? "PDF" };
}

/** Lecture d'un PDF importé, en lecture seule, dans le lecteur de GePro. */
export default async function PdfDocumentPage({ params }: Props) {
  const me = await requireUser();
  const file = await loadFile(await params);
  if (!file) notFound();

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
          canDelete={me.role === "admin" || file.uploadedBy === me.id}
        />
      </header>

      {/* La clé repart d'un lecteur neuf si l'onglet passe d'un PDF à un autre. */}
      <PdfViewer key={file.id} src={`/api/fichiers/${file.id}`} />
    </div>
  );
}
