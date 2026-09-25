"use client";

import { useEffect, useRef } from "react";

/**
 * Exécute `task` à intervalle régulier tant que `enabled` est vrai.
 *
 * - Jamais deux exécutions en parallèle : le délai court à partir de la fin de la précédente.
 * - `task` peut renvoyer un délai (ms) pour la prochaine exécution (limite de débit, rattrapage).
 * - En pause quand l'onglet est masqué ; reprise immédiate quand il redevient visible.
 * - Première exécution immédiate à l'activation.
 */
export function usePolling(task: () => Promise<number | void>, intervalMs: number, enabled: boolean) {
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let running = false;
    // Fonction (et non une constante) : l'état change pendant l'attente de la tâche.
    const hidden = () => document.visibilityState === "hidden";

    async function tick() {
      if (cancelled || running || hidden()) return;
      running = true;
      let next: number | void = undefined;
      try {
        next = await taskRef.current();
      } catch {
        // Aux tâches de gérer leurs erreurs : une exception ne doit pas arrêter l'interrogation.
      } finally {
        running = false;
      }
      if (cancelled || hidden()) return;
      clearTimeout(timer);
      timer = setTimeout(tick, next ?? intervalMs);
    }

    function onVisibilityChange() {
      clearTimeout(timer);
      if (!hidden()) void tick();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
