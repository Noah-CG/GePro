"use client";

import { useEffect, useRef } from "react";
import { refreshProjectResources } from "@/actions/integrations";

/**
 * Rafraîchit en arrière-plan les métadonnées (titre, date) des documents d'un projet quand le
 * cache est ancien, une fois par affichage et sans bloquer la page. Une erreur passagère
 * (quota, réseau) est ignorée : les dernières informations connues restent affichées.
 */
export function ResourceAutoRefresh({ projectId, stale }: { projectId: string; stale: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (!stale || done.current) return;
    done.current = true;
    void refreshProjectResources(projectId);
  }, [stale, projectId]);
  return null;
}
