"use client";

import { Download, Trash2, Upload } from "lucide-react";
import { useState, useTransition, type DragEvent } from "react";
import { deleteFile } from "@/actions/files";
import { useApp } from "@/components/layout/app-provider";
import { DocumentTabLink } from "@/components/layout/tabs";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { formatFileSize, MAX_FILE_SIZE } from "@/lib/files";
import type { FileView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { PdfIcon } from "./pdf-icon";
import { PdfUploadList, usePdfImport } from "./use-pdf-import";

/** Page Documents d'un projet : ses PDF, leur import (bouton ou glisser-déposer) et leur suppression. */
export function ProjectFiles({ projectId, files }: { projectId: string; files: FileView[] }) {
  const { uploads, importFiles, chooseFiles, fileInput } = usePdfImport(projectId);
  const [dragging, setDragging] = useState(false);

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      // Ignore le passage d'un élément enfant à un autre.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      void importFiles(Array.from(e.dataTransfer.files));
    },
  };

  return (
    <Card className={cn("relative transition-shadow", dragging && "ring-2 ring-accent")}>
      <div {...dropProps}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">
            Fichiers PDF {files.length > 0 && <span className="font-normal text-muted">{files.length}</span>}
          </h2>
          <Button size="sm" variant="ghost" onClick={chooseFiles}>
            <Upload size={14} /> Importer un PDF
          </Button>
        </div>

        {files.length > 0 && (
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </ul>
        )}
        <PdfUploadList uploads={uploads} className="border-t border-border px-1.5 py-1 first:border-t-0" />

        {/* Zone de dépôt : aussi un bouton, pour le clavier et les écrans tactiles. */}
        <button
          onClick={chooseFiles}
          className={cn(
            "m-3 flex w-[calc(100%-1.5rem)] flex-col items-center gap-1 rounded-lg border border-dashed px-4 text-center text-sm text-muted transition-colors hover:border-accent hover:text-text",
            files.length === 0 ? "py-8" : "py-4",
            dragging ? "border-accent bg-accent/5 text-text" : "border-border",
          )}
        >
          <Upload size={18} aria-hidden />
          <span>
            {dragging ? "Déposez le fichier pour l'importer" : "Glissez un PDF ici, ou cliquez pour le choisir depuis votre ordinateur"}
          </span>
          <span className="text-xs">PDF uniquement, {formatFileSize(MAX_FILE_SIZE)} au plus. Lisible par tout le projet, en lecture seule.</span>
        </button>
        {fileInput}
      </div>
    </Card>
  );
}

function FileRow({ file: f }: { file: FileView }) {
  const { me, toast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const canDelete = me.role === "admin" || f.uploadedBy === me.id;

  function remove() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await deleteFile(f.id);
      setConfirming(false);
      if (!res.ok) return toast(res.error, "error");
      toast("Fichier supprimé");
    });
  }

  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5", pending && "opacity-50")}>
      <PdfIcon size={16} className="shrink-0" />
      <div className="min-w-0 flex-1">
        {/* S'ouvre dans un onglet GePro, sans quitter la liste. */}
        <DocumentTabLink href={`/projets/${f.projectId}/documents/pdf/${f.id}`} className="block truncate text-sm font-medium hover:underline">
          {f.title}
        </DocumentTabLink>
        <p className="truncate text-xs text-muted">
          {f.sizeLabel} · importé le {f.uploadedLabel}
          {f.uploadedByName && ` par ${f.uploadedByName}`}
        </p>
      </div>
      <a
        href={`/api/fichiers/${f.id}?telechargement=1`}
        className={buttonClass({ size: "icon", variant: "ghost" })}
        aria-label={`Télécharger ${f.title}`}
        title="Télécharger"
      >
        <Download size={14} />
      </a>
      {canDelete && (
        <Button
          size={confirming ? "sm" : "icon"}
          variant={confirming ? "danger" : "ghost"}
          onClick={remove}
          onBlur={() => setConfirming(false)}
          disabled={pending}
          aria-label={confirming ? `Confirmer la suppression de ${f.title}` : `Supprimer ${f.title}`}
          title="Supprimer"
        >
          <Trash2 size={14} />
          {confirming && "Supprimer"}
        </Button>
      )}
    </li>
  );
}
