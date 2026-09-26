"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createProjectLink, updateProjectLink } from "@/actions/links";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { defaultLinkTitle, detectLink } from "@/lib/links/detect";
import type { ProjectLinkView } from "@/lib/queries";
import { LINK_TITLE_MAX, LINK_URL_MAX } from "@/lib/validation";
import { LinkIcon } from "./link-icon";

/**
 * Fenêtre d'ajout ou de modification d'un lien utile. Le service est reconnu en direct pendant
 * la saisie de l'adresse ; un titre laissé vide prend le nom du service, sinon le domaine.
 * Entrée enregistre, Échap ferme.
 */
export function LinkDialog({
  open,
  onOpenChange,
  projectId,
  link,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Lien existant, à modifier. */
  link?: ProjectLinkView;
}) {
  const { toast } = useApp();
  const [url, setUrl] = useState(link?.url ?? "");
  const [title, setTitle] = useState(link?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const detected = detectLink(url);
  const fallbackTitle = detected ? defaultLinkTitle(detected) : "";
  // L'aperçu suit la saisie avec un léger retard : pas un favicon demandé par lettre tapée.
  const previewUrl = useDebounced(url, 250);
  const preview = detectLink(previewUrl);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!detected) return setError(url.trim() ? "Adresse invalide : seuls les liens http et https sont acceptés." : "L'adresse est obligatoire");
    const input = { url, title: title.trim() || fallbackTitle };
    startTransition(async () => {
      const res = link ? await updateProjectLink(link.id, input) : await createProjectLink(projectId, input);
      if (!res.ok) return setError(res.error);
      toast(link ? "Lien mis à jour" : "Lien ajouté");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={link ? "Modifier le lien" : "Ajouter un lien utile"}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Adresse" htmlFor="link-url">
          <Input
            id="link-url"
            autoFocus
            required
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={LINK_URL_MAX}
            placeholder="https://github.com/equipe/projet"
            aria-describedby="link-detected"
            aria-invalid={error !== null && !detected}
          />
          <p id="link-detected" aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-xs text-muted">
            {preview ? (
              <>
                <LinkIcon link={preview} size={14} />
                {preview.service ? (
                  <span>
                    <span className="font-medium text-text">{preview.service.name}</span> détecté
                  </span>
                ) : (
                  <span>
                    Site <span className="font-medium text-text">{preview.domain}</span>
                  </span>
                )}
              </>
            ) : previewUrl.trim() ? (
              <span>Adresse non reconnue : seuls les liens http et https sont acceptés.</span>
            ) : null}
          </p>
        </Field>

        <Field label="Titre" htmlFor="link-title" hint="Laissé vide : le nom du service, ou à défaut le domaine.">
          <Input
            id="link-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LINK_TITLE_MAX}
            placeholder={fallbackTitle || "Ex. Maquettes de l'accueil"}
          />
        </Field>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {link ? "Enregistrer" : "Ajouter"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
