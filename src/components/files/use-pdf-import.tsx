"use client";

import { useEffect, useRef, useState } from "react";
import { cancelFileUpload, finishFileUpload, startFileUpload, uploadFileChunk } from "@/actions/files";
import { useApp } from "@/components/layout/app-provider";
import { useTabs } from "@/components/layout/tabs";
import { ProgressBar } from "@/components/ui/misc";
import { CHUNK_SIZE, fileTitle, pdfFileError } from "@/lib/files";
import { PdfIcon } from "./pdf-icon";

/** Import en cours, affiché avec sa progression (0 à 1). */
export type PdfUpload = { key: number; name: string; progress: number };

class UploadError extends Error {}

/** Nouvel essai après une coupure réseau (la Server Action n'a pas pu être appelée). */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return run();
  }
}

/**
 * Import de PDF dans un projet, depuis la barre latérale ou la page Documents.
 *
 * Chaque fichier est envoyé par morceaux (limite de taille des Server Actions), l'un après
 * l'autre ; un import unique s'ouvre ensuite dans un onglet GePro. `fileInput` est le champ
 * fichier (caché) à placer dans la page, ouvert par `chooseFiles`.
 */
export function usePdfImport(projectId: string) {
  const { toast } = useApp();
  const { showInTab } = useTabs();
  const [uploads, setUploads] = useState<PdfUpload[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  // Quitter la page interromprait l'envoi : le navigateur demande confirmation.
  const uploading = uploads.length > 0;
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const setProgress = (key: number, progress: number) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, progress } : u)));

  async function upload(file: File, key: number): Promise<string> {
    const started = await withRetry(() => startFileUpload(projectId, { name: file.name, size: file.size, type: file.type }));
    if (!started.ok) throw new UploadError(started.error);
    const { id, chunkCount } = started.data;
    try {
      for (let position = 0; position < chunkCount; position++) {
        const form = new FormData();
        form.set("id", id);
        form.set("position", String(position));
        form.set("chunk", file.slice(position * CHUNK_SIZE, (position + 1) * CHUNK_SIZE));
        const res = await withRetry(() => uploadFileChunk(form));
        if (!res.ok) throw new UploadError(res.error);
        setProgress(key, (position + 1) / chunkCount);
      }
      const done = await withRetry(() => finishFileUpload(id));
      if (!done.ok) throw new UploadError(done.error);
      return id;
    } catch (e) {
      // Les morceaux déjà reçus ne serviront plus.
      cancelFileUpload(id).catch(() => {});
      throw e;
    }
  }

  async function importFiles(files: File[]) {
    const accepted = files.filter((file) => {
      const error = pdfFileError(file);
      if (error) toast(`${file.name} : ${error}`, "error");
      return !error;
    });
    const queued = accepted.map((file) => ({ file, key: ++nextKey.current }));
    setUploads((list) => [...list, ...queued.map(({ file, key }) => ({ key, name: file.name, progress: 0 }))]);

    for (const { file, key } of queued) {
      try {
        const id = await upload(file, key);
        toast(`« ${fileTitle(file.name)} » importé`);
        if (queued.length === 1) showInTab(`/projets/${projectId}/documents/pdf/${id}`);
      } catch (e) {
        const reason = e instanceof UploadError ? e.message : "La connexion a été interrompue.";
        toast(`Échec de l'import de ${file.name} : ${reason}`, "error");
      } finally {
        setUploads((list) => list.filter((u) => u.key !== key));
      }
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        // Permet de choisir de nouveau le même fichier.
        e.target.value = "";
        if (files.length > 0) void importFiles(files);
      }}
    />
  );

  return { uploads, importFiles, chooseFiles: () => inputRef.current?.click(), fileInput };
}

/** Imports en cours : nom du fichier et progression de l'envoi. */
export function PdfUploadList({ uploads, className }: { uploads: PdfUpload[]; className?: string }) {
  if (uploads.length === 0) return null;
  return (
    <ul role="status" aria-label="Imports en cours" className={className}>
      {uploads.map((u) => {
        const percent = Math.round(u.progress * 100);
        return (
          <li key={u.key} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
            <PdfIcon size={15} className="shrink-0 opacity-60" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-muted">{fileTitle(u.name)}</p>
              <ProgressBar value={percent} className="mt-1 h-1" />
            </div>
            <span className="shrink-0 text-xs text-muted tabular-nums">{percent} %</span>
          </li>
        );
      })}
    </ul>
  );
}
