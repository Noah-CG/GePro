"use client";

import { AlertTriangle, ExternalLink, FileText, Plus, RefreshCw, Unlink } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { detachResource, refreshProjectResources } from "@/actions/integrations";
import { useApp } from "@/components/layout/app-provider";
import { DocumentTabLink } from "@/components/layout/tabs";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { resourceProblemMessage } from "@/lib/integrations/errors";
import type { ConnectionView, ResourceView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { AttachDocDialog } from "./attach-doc-dialog";
import { ResourceAutoRefresh } from "./resource-auto-refresh";

/** Page Documents d'un projet : liste, lecture, rattachement et détachement des Google Docs. */
export function ProjectDocuments({
  projectId,
  resources,
  stale,
  googleConfigured,
  connection,
}: {
  projectId: string;
  resources: ResourceView[];
  /** Vrai si le cache mérite d'être rafraîchi : on le fait en arrière-plan à l'affichage. */
  stale: boolean;
  googleConfigured: boolean;
  connection: ConnectionView | null;
}) {
  const { toast } = useApp();
  const [attachOpen, setAttachOpen] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const refresh = () =>
    startRefresh(async () => {
      const res = await refreshProjectResources(projectId);
      if (res.ok) toast("Documents actualisés");
      else toast(res.error, "error");
    });

  return (
    <Card>
      <ResourceAutoRefresh projectId={projectId} stale={stale} />
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          Google Docs {resources.length > 0 && <span className="font-normal text-muted">{resources.length}</span>}
        </h2>
        <div className="flex items-center gap-1">
          {resources.length > 0 && (
            <Button size="icon" variant="ghost" onClick={refresh} disabled={refreshing} aria-label="Actualiser les documents" title="Actualiser">
              <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            </Button>
          )}
          {googleConfigured && (
            <Button size="sm" variant="ghost" onClick={() => setAttachOpen(true)}>
              <Plus size={14} /> Rattacher un Google Doc
            </Button>
          )}
        </div>
      </div>

      {resources.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted">
          {googleConfigured ? (
            <p>Aucun document rattaché. Rattachez les Google Docs du projet (cahier des charges, comptes rendus…) pour les lire ici.</p>
          ) : (
            <>
              <p>L&apos;intégration Google n&apos;est pas configurée sur ce serveur.</p>
              <Link href={`/projets/${projectId}/parametres`} className={buttonClass({ size: "sm", className: "mt-3" })}>
                Voir les paramètres du projet
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {resources.map((r) => (
            <DocumentRow key={r.id} resource={r} />
          ))}
        </ul>
      )}

      <AttachDocDialog
        // La clé force une fenêtre neuve (recherche vide) à chaque ouverture.
        key={attachOpen ? "open" : "closed"}
        open={attachOpen}
        onOpenChange={setAttachOpen}
        projectId={projectId}
        connection={connection}
        attachedIds={resources.map((r) => r.externalId)}
      />
    </Card>
  );
}

function DocumentRow({ resource: r }: { resource: ResourceView }) {
  const { toast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function detach() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await detachResource(r.id);
      setConfirming(false);
      if (!res.ok) return toast(res.error, "error");
      toast("Document détaché");
    });
  }

  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5", pending && "opacity-50")}>
      <FileText size={16} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        {/* S'ouvre dans un onglet GePro, sans quitter la liste. */}
        <DocumentTabLink href={`/projets/${r.projectId}/documents/${r.id}`} className="block truncate text-sm font-medium hover:underline">
          {r.title}
        </DocumentTabLink>
        <p className="truncate text-xs text-muted">
          {r.updatedLabel ? `Modifié le ${r.updatedLabel}` : "Date de modification inconnue"}
          {r.attachedByName && ` · rattaché par ${r.attachedByName}`}
        </p>
        {r.problem && (
          <p className="mt-0.5 flex items-start gap-1 text-xs text-warning">
            <AlertTriangle size={12} className="mt-px shrink-0" />
            {resourceProblemMessage(r.problem, r.attachedByName)}
          </p>
        )}
      </div>
      <a
        href={r.url}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass({ size: "icon", variant: "ghost" })}
        aria-label={`Ouvrir ${r.title} dans Google Docs`}
        title="Ouvrir dans Google Docs"
      >
        <ExternalLink size={14} />
      </a>
      <Button
        size={confirming ? "sm" : "icon"}
        variant={confirming ? "danger" : "ghost"}
        onClick={detach}
        onBlur={() => setConfirming(false)}
        disabled={pending}
        aria-label={`Détacher ${r.title}`}
        title="Détacher du projet"
      >
        <Unlink size={14} />
        {confirming && "Détacher"}
      </Button>
    </li>
  );
}
