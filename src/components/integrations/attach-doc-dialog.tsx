"use client";

import { Check, FileText, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { attachGoogleDoc, searchGoogleDocs, type DocOption } from "@/actions/integrations";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { parseDocId } from "@/lib/integrations/doc-links";
import { INTEGRATION_ERROR_MESSAGES } from "@/lib/integrations/errors";
import type { ConnectionView } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Fenêtre de rattachement d'un Google Doc : recherche dans le Drive de l'utilisateur, ou lien collé. */
export function AttachDocDialog({
  open,
  onOpenChange,
  projectId,
  connection,
  attachedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  connection: ConnectionView | null;
  attachedIds: string[];
}) {
  const connected = connection?.status === "active";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rattacher un Google Doc"
      description={connected ? `Depuis le Google Drive de ${connection.email || "votre compte"}` : undefined}
    >
      {connected ? (
        <AttachForm projectId={projectId} attachedIds={attachedIds} onDone={() => onOpenChange(false)} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {connection?.status === "needs_reauth"
              ? "Votre connexion Google a expiré ou a été révoquée. Reconnectez votre compte pour rattacher des documents."
              : "Connectez d'abord votre compte Google (accès en lecture seule) pour rattacher des documents à ce projet."}
          </p>
          <div className="flex justify-end">
            <Link href={`/projets/${projectId}/parametres`} className={buttonClass({ variant: "primary" })}>
              Ouvrir les paramètres du projet
            </Link>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function AttachForm({ projectId, attachedIds, onDone }: { projectId: string; attachedIds: string[]; onDone: () => void }) {
  const { toast } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocOption[] | null>(null);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Document en cours de rattachement (clic dans la liste), pour son indicateur.
  const [attaching, setAttaching] = useState<string | null>(null);

  // Recherche à la frappe (300 ms d'attente), et liste des documents récents à l'ouverture.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        setSearching(true);
        const res = await searchGoogleDocs(query);
        if (cancelled) return;
        setSearching(false);
        if (res.ok) {
          setResults(res.data);
          setSearchError(null);
        } else setSearchError(res.error);
      },
      query ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function attach(value: string) {
    setError(null);
    setAttaching(value);
    startTransition(async () => {
      const res = await attachGoogleDoc(projectId, value);
      if (!res.ok) return setError(res.error);
      toast("Document rattaché");
      onDone();
    });
  }

  // Validation du format dès la saisie ; le serveur revérifie de toute façon.
  const linkInvalid = link.trim() !== "" && parseDocId(link) === null;

  function submitLink(e: FormEvent) {
    e.preventDefault();
    if (link.trim() && !linkInvalid) attach(link);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un document par son titre"
            aria-label="Rechercher un Google Doc"
            className="pl-8"
            maxLength={100}
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-lg border border-border" aria-busy={searching}>
          {searchError ? (
            <p className="px-3 py-4 text-sm text-danger">{searchError}</p>
          ) : results === null ? (
            <p className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Chargement de vos documents…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              {query ? "Aucun Google Doc ne correspond à cette recherche." : "Aucun Google Doc dans ce Drive."}
            </p>
          ) : (
            <ul className={cn("divide-y divide-border", searching && "opacity-60")}>
              {results.map((doc) => {
                const attached = attachedIds.includes(doc.id);
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => attach(doc.id)}
                      disabled={attached || pending}
                      aria-busy={(pending && attaching === doc.id) || undefined}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <FileText size={16} className="shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{doc.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {doc.updatedLabel ? `Modifié le ${doc.updatedLabel}` : "Date inconnue"}
                          {doc.lastModifiedBy && ` par ${doc.lastModifiedBy}`}
                        </span>
                      </span>
                      {pending && attaching === doc.id && <Spinner size={14} className="text-accent" />}
                      {attached && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                          <Check size={12} /> Déjà rattaché
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <form onSubmit={submitLink} className="border-t border-border pt-4">
        <Field label="Ou collez le lien du document" htmlFor="doc-link">
          <div className="flex gap-2">
            <Input
              id="doc-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://docs.google.com/document/d/…"
              maxLength={500}
              aria-invalid={linkInvalid}
              aria-describedby={linkInvalid ? "doc-link-error" : undefined}
            />
            <Button type="submit" variant="primary" disabled={!link.trim() || linkInvalid} loading={pending}>
              Rattacher
            </Button>
          </div>
          {linkInvalid && (
            <p id="doc-link-error" className="text-xs text-danger">
              {INTEGRATION_ERROR_MESSAGES.invalid_link}
            </p>
          )}
        </Field>
      </form>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
