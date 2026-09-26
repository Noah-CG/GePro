import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DocumentActions } from "@/components/integrations/document-actions";
import { GoogleDocsIcon } from "@/components/integrations/google-docs-icon";
import { MarkdownDocument } from "@/components/integrations/markdown-document";
import { ResourceAutoRefresh } from "@/components/integrations/resource-auto-refresh";
import { requireProjectAccess } from "@/lib/access";
import { readDocumentContent } from "@/lib/integrations/documents";
import { resourceProblemMessage } from "@/lib/integrations/errors";
import { getProjectResource } from "@/lib/queries";
import { isUuid } from "@/lib/validation";

type Props = { params: Promise<{ id: string; docId: string }> };

/** Document d'un projet dont on est membre (sinon 404). */
async function loadResource({ id, docId }: { id: string; docId: string }) {
  await requireProjectAccess(id);
  if (!isUuid(docId)) return null;
  return getProjectResource(id, docId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadResource(await params);
  return { title: found?.resource.title ?? "Document" };
}

/** Lecture d'un Google Doc rattaché, en lecture seule. */
export default async function DocumentPage({ params }: Props) {
  const found = await loadResource(await params);
  if (!found) notFound();
  const { resource: doc, stale } = found;

  return (
    <div className="mx-auto max-w-3xl">
      <ResourceAutoRefresh projectId={doc.projectId} stale={stale} />
      <Link href={`/projets/${doc.projectId}/documents`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> Documents
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <GoogleDocsIcon size={20} className="shrink-0" />
            <span className="truncate">{doc.title}</span>
          </h1>
          <p className="mt-1 text-xs text-muted">
            Lecture seule · {doc.updatedLabel ? `modifié le ${doc.updatedLabel}` : "date de modification inconnue"}
            {doc.attachedByName && ` · rattaché par ${doc.attachedByName}`}
          </p>
        </div>
        <DocumentActions projectId={doc.projectId} url={doc.url} />
      </header>

      {/* Le contenu arrive de Google : l'en-tête s'affiche sans l'attendre. */}
      <Suspense fallback={<ContentSkeleton />}>
        <DocumentBody resourceId={doc.id} attachedByName={doc.attachedByName} />
      </Suspense>
    </div>
  );
}

async function DocumentBody({ resourceId, attachedByName }: { resourceId: string; attachedByName: string | null }) {
  const content = await readDocumentContent(resourceId);
  if (!content.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>
          Impossible d&apos;afficher le contenu du document. {resourceProblemMessage(content.code, attachedByName)}
        </p>
      </div>
    );
  }
  if (!content.markdown.trim()) return <p className="text-sm text-muted">Ce document est vide.</p>;
  return <MarkdownDocument markdown={content.markdown} />;
}

function ContentSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Chargement du document">
      <div className="h-6 w-2/3 rounded bg-surface-2" />
      {[100, 95, 98, 80, 92, 60].map((w, i) => (
        <div key={i} className="h-3.5 rounded bg-surface-2" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
