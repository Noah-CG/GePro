"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/dates";

/**
 * Durée écoulée depuis `since`, mise à jour toutes les 30 s. `baseMs` (calculé par le serveur)
 * s'y ajoute ; le premier rendu reprend `initialMs` pour être identique côté serveur et client.
 */
export function LiveDuration({ since, baseMs = 0, initialMs }: { since: string; baseMs?: number; initialMs: number }) {
  const [elapsed, setElapsed] = useState(initialMs);

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Date.now() - new Date(since).getTime()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [since]);

  return <>{formatDuration(baseMs + elapsed)}</>;
}
