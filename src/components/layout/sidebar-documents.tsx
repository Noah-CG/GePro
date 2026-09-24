"use client";

import { AlertTriangle, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AttachDocDialog } from "@/components/integrations/attach-doc-dialog";
import { GoogleDocsIcon } from "@/components/integrations/google-docs-icon";
import type { ConnectionView, ResourceLink } from "@/lib/queries";
import { itemClass, SidebarNavItem, SidebarSection, useSidebar } from "./sidebar-parts";
import { DocumentTabLink } from "./tabs";

export type GoogleSidebarState = { configured: boolean; connection: ConnectionView | null };

/**
 * Section « Documents » du projet sélectionné : ses Google Docs, chacun ouvert en lecture dans
 * un onglet GePro (sans quitter l'onglet actuel), et le bouton pour en lier un.
 */
export function SidebarDocuments({
  projectId,
  resources,
  google,
}: {
  projectId: string;
  resources: ResourceLink[];
  google: GoogleSidebarState;
}) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const [attachOpen, setAttachOpen] = useState(false);
  const docsHref = `/projets/${projectId}/documents`;

  const dialog = google.configured && (
    <AttachDocDialog
      // La clé force une fenêtre neuve (recherche vide) à chaque ouverture.
      key={attachOpen ? "open" : "closed"}
      open={attachOpen}
      onOpenChange={setAttachOpen}
      projectId={projectId}
      connection={google.connection}
      attachedIds={resources.map((r) => r.externalId)}
    />
  );

  // Barre réduite : une seule icône vers la page Documents (les titres ne tiennent pas en icônes).
  if (collapsed) {
    return (
      <SidebarNavItem
        href={docsHref}
        icon={FileText}
        label="Documents"
        tooltip={`Documents (${resources.length})`}
        active={pathname.startsWith(docsHref)}
      />
    );
  }

  return (
    <SidebarSection
      id="documents"
      title="Documents"
      action={
        google.configured && (
          <button
            onClick={() => setAttachOpen(true)}
            aria-label="Lier un Google Doc"
            title="Lier un Google Doc"
            className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
          >
            <Plus size={15} />
          </button>
        )
      }
    >
      {resources.map((r) => {
        const href = `${docsHref}/${r.id}`;
        const active = pathname === href;
        return (
          <DocumentTabLink
            key={r.id}
            href={href}
            title={r.title}
            aria-current={active ? "page" : undefined}
            className={itemClass({ active, collapsed: false, className: "py-1.5" })}
          >
            <GoogleDocsIcon size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            {r.hasProblem && (
              <AlertTriangle size={12} className="shrink-0 text-warning" aria-label="Synchronisation en erreur" role="img" />
            )}
          </DocumentTabLink>
        );
      })}

      {resources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
          <p>Aucun document lié à ce projet.</p>
          {google.configured ? (
            <button onClick={() => setAttachOpen(true)} className="mt-2 inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <Plus size={13} /> Lier un Google Doc
            </button>
          ) : (
            <Link href={`/projets/${projectId}/parametres`} className="mt-2 inline-block font-medium text-accent hover:underline">
              Voir les paramètres
            </Link>
          )}
        </div>
      ) : (
        <Link
          href={docsHref}
          aria-current={pathname === docsHref ? "page" : undefined}
          className="block rounded-md px-2.5 py-1 text-xs text-muted hover:text-text aria-[current=page]:font-medium aria-[current=page]:text-text"
        >
          Gérer les documents
        </Link>
      )}

      {dialog}
    </SidebarSection>
  );
}
