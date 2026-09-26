"use client";

import * as Popover from "@radix-ui/react-popover";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteProjectLink } from "@/actions/links";
import { LinkDialog } from "@/components/links/link-dialog";
import { LinkIcon } from "@/components/links/link-icon";
import { Spinner } from "@/components/ui/button";
import { SideTooltip } from "@/components/ui/misc";
import { detectLink } from "@/lib/links/detect";
import type { ProjectLinkView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";
import { itemClass, SidebarSection, useSidebar } from "./sidebar-parts";

const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";

/** Fenêtre ouverte : ajout (`link` absent) ou modification d'un lien. */
type DialogState = { open: false } | { open: true; link?: ProjectLinkView };

/**
 * Section « Liens utiles » du projet sélectionné : liens externes (dépôt, maquettes, tableau…)
 * ouverts dans un nouvel onglet du navigateur, avec l'icône du service reconnu. Tout membre peut
 * en ajouter, modifier ou supprimer.
 */
export function SidebarLinks({ projectId, links }: { projectId: string; links: ProjectLinkView[] }) {
  const { collapsed } = useSidebar();
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const dialogElement = dialog.open && (
    <LinkDialog
      // La clé repart d'un formulaire neuf pour chaque lien.
      key={dialog.link?.id ?? "nouveau"}
      open
      onOpenChange={(open) => !open && setDialog({ open: false })}
      projectId={projectId}
      link={dialog.link}
    />
  );

  // Barre réduite : les icônes seules, avec le titre en info-bulle.
  if (collapsed) {
    if (links.length === 0) return null;
    return (
      <SidebarSection id="liens" title="Liens utiles">
        {links.map((l) => (
          <a
            key={l.id}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${l.title} (nouvel onglet)`}
            className={itemClass({ active: false, collapsed: true })}
          >
            <LinkIcon link={detectLink(l.url)} size={18} />
            <SideTooltip label={l.title} />
          </a>
        ))}
      </SidebarSection>
    );
  }

  const action = (
    <button onClick={() => setDialog({ open: true })} aria-label="Ajouter un lien" title="Ajouter un lien" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text">
      <Plus size={15} />
    </button>
  );

  return (
    <SidebarSection id="liens" title="Liens utiles" action={action}>
      {links.map((l) => (
        <LinkRow key={l.id} link={l} onEdit={() => setDialog({ open: true, link: l })} />
      ))}
      {links.length === 0 && (
        <div className="px-2.5 py-1 text-xs text-muted">
          <p>Aucun lien</p>
          <button onClick={() => setDialog({ open: true })} className="mt-1 inline-flex items-center gap-1 font-medium text-accent hover:underline">
            <Plus size={13} /> Ajouter un lien
          </button>
        </div>
      )}
      {dialogElement}
    </SidebarSection>
  );
}

/** Une ligne : icône + titre tronqué (adresse complète au survol), menu « … » au survol. */
function LinkRow({ link, onEdit }: { link: ProjectLinkView; onEdit: () => void }) {
  const { toast } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDeleting] = useTransition();

  function openMenu(open: boolean) {
    setMenuOpen(open);
    if (!open) setConfirmDelete(false);
  }

  function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    startDeleting(async () => {
      const res = await deleteProjectLink(link.id);
      openMenu(false);
      toast(res.ok ? "Lien supprimé" : res.error, res.ok ? "success" : "error");
    });
  }

  return (
    <div className="group/link relative">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        title={link.url}
        className={itemClass({ active: false, collapsed: false, className: "py-1.5 pr-8" })}
      >
        <LinkIcon link={detectLink(link.url)} size={16} />
        <span className="min-w-0 flex-1 truncate">{link.title}</span>
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
      <Popover.Root open={menuOpen} onOpenChange={openMenu}>
        <Popover.Trigger
          aria-label={`Actions sur le lien ${link.title}`}
          className={cn(
            "absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-surface hover:text-text",
            // Visible au survol de la ligne, au clavier et tant que le menu est ouvert.
            "opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <MoreHorizontal size={15} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" sideOffset={4} className="z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
            <button
              className={menuItem}
              onClick={() => {
                openMenu(false);
                onEdit();
              }}
            >
              <Pencil size={15} className="text-muted" /> Modifier
            </button>
            <button
              className={cn(menuItem, "text-danger", confirmDelete && "bg-danger-soft font-medium")}
              onClick={remove}
              disabled={deleting}
              aria-busy={deleting || undefined}
            >
              {deleting ? <Spinner size={15} /> : <Trash2 size={15} />}
              {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
