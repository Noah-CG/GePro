"use client";

import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, FileText, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PdfIcon } from "@/components/files/pdf-icon";
import { PdfUploadList, usePdfImport } from "@/components/files/use-pdf-import";
import { AttachDocDialog } from "@/components/integrations/attach-doc-dialog";
import { GoogleDocsIcon } from "@/components/integrations/google-docs-icon";
import type { ConnectionView, FileLink, ResourceLink } from "@/lib/queries";
import { itemClass, SidebarNavItem, SidebarSection, useSidebar } from "./sidebar-parts";
import { DocumentTabLink } from "./tabs";

export type GoogleSidebarState = { configured: boolean; connection: ConnectionView | null };

const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";

/**
 * Section « Documents » du projet sélectionné : ses Google Docs et ses PDF, chacun ouvert en
 * lecture dans un onglet GePro (sans quitter l'onglet actuel), et le bouton pour en ajouter.
 */
export function SidebarDocuments({
  projectId,
  resources,
  files,
  google,
}: {
  projectId: string;
  resources: ResourceLink[];
  files: FileLink[];
  google: GoogleSidebarState;
}) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { uploads, chooseFiles, fileInput } = usePdfImport(projectId);
  const docsHref = `/projets/${projectId}/documents`;
  const count = resources.length + files.length;

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
        tooltip={`Documents (${count})`}
        active={pathname.startsWith(docsHref)}
      />
    );
  }

  const addButton = "rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text";
  // Sans Google, « + » importe directement un PDF ; sinon il propose les deux.
  const action = google.configured ? (
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Trigger aria-label="Ajouter un document" title="Ajouter un document" className={addButton}>
        <Plus size={15} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} className="z-50 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
          <button
            className={menuItem}
            onClick={() => {
              setMenuOpen(false);
              chooseFiles();
            }}
          >
            <Upload size={15} className="text-muted" /> Importer un PDF
          </button>
          <button
            className={menuItem}
            onClick={() => {
              setMenuOpen(false);
              setAttachOpen(true);
            }}
          >
            <GoogleDocsIcon size={15} /> Lier un Google Doc
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  ) : (
    <button onClick={chooseFiles} aria-label="Importer un PDF" title="Importer un PDF" className={addButton}>
      <Plus size={15} />
    </button>
  );

  const link = (href: string, title: string, icon: ReactNode, problem = false) => {
    const active = pathname === href;
    return (
      <DocumentTabLink
        key={href}
        href={href}
        title={title}
        aria-current={active ? "page" : undefined}
        className={itemClass({ active, collapsed: false, className: "py-1.5" })}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {problem && <AlertTriangle size={12} className="shrink-0 text-warning" aria-label="Synchronisation en erreur" role="img" />}
      </DocumentTabLink>
    );
  };

  return (
    <SidebarSection id="documents" title="Documents" action={action}>
      {resources.map((r) => link(`${docsHref}/${r.id}`, r.title, <GoogleDocsIcon size={15} className="shrink-0" />, r.hasProblem))}
      {files.map((f) => link(`${docsHref}/pdf/${f.id}`, f.title, <PdfIcon size={15} className="shrink-0" />))}
      <PdfUploadList uploads={uploads} />

      {count === 0 && uploads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
          <p>Aucun document dans ce projet.</p>
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <button onClick={chooseFiles} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <Upload size={13} /> Importer un PDF
            </button>
            {google.configured && (
              <button onClick={() => setAttachOpen(true)} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                <Plus size={13} /> Lier un Google Doc
              </button>
            )}
          </div>
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

      {fileInput}
      {dialog}
    </SidebarSection>
  );
}
