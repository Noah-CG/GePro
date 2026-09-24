"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { refreshProjectResources } from "@/actions/integrations";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Actions de la page de lecture d'un document : « Actualiser » (titre, date et contenu relus
 * chez Google, pour voir les dernières modifications) et « Ouvrir dans Google Docs ».
 */
export function DocumentActions({ projectId, url }: { projectId: string; url: string }) {
  const { toast } = useApp();
  const [refreshing, startRefresh] = useTransition();

  // La Server Action revalide la page : son contenu est de nouveau exporté depuis Google.
  const refresh = () =>
    startRefresh(async () => {
      const res = await refreshProjectResources(projectId);
      if (res.ok) toast("Document actualisé");
      else toast(res.error, "error");
    });

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button size="sm" onClick={refresh} loading={refreshing} aria-label="Actualiser le document">
        <RefreshCw size={14} /> {refreshing ? "Actualisation…" : "Actualiser"}
      </Button>
      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "sm", variant: "primary" })}>
        <ExternalLink size={14} /> Ouvrir dans Google Docs
      </a>
    </div>
  );
}
