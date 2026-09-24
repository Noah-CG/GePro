"use client";

import { Play, Square } from "lucide-react";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { startWorkTimer, stopWorkTimer } from "@/actions/work-sessions";
import { useApp } from "@/components/layout/app-provider";
import { formatClock, formatDuration } from "@/lib/dates";
import type { WorkSummary } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Chrono de temps de travail : un clic pour démarrer, un clic pour arrêter. L'état vit en base
 * (il survit à un rechargement et se retrouve sur un autre appareil) ; l'affichage défile ici.
 */
export function WorkTimer({ summary }: { summary: WorkSummary }) {
  const { toast } = useApp();
  const [pending, startTransition] = useTransition();
  const [runningSince, setRunningSince] = useOptimistic(summary.runningSince);
  // Heure courante, connue seulement après l'hydratation (évite un écart serveur / navigateur).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!runningSince) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [runningSince]);

  const running = runningSince !== null;
  const elapsed = running && now !== null ? Math.max(0, now - new Date(runningSince).getTime()) : 0;

  function toggle() {
    startTransition(async () => {
      setRunningSince(running ? null : new Date().toISOString());
      const res = await (running ? stopWorkTimer() : startWorkTimer());
      if (!res.ok) toast(res.error, "error");
      else if (running) toast(`${formatDuration(elapsed)} de travail enregistrées`);
    });
  }

  return (
    <div className="flex items-center gap-4 p-4">
      <button
        onClick={toggle}
        disabled={pending}
        aria-pressed={running}
        aria-label={running ? "Arrêter le chrono" : "Démarrer le chrono"}
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-60",
          running ? "bg-danger" : "bg-success",
        )}
      >
        {running ? <Square size={20} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("font-mono text-2xl font-semibold tabular-nums", !running && "text-muted")}>{formatClock(elapsed)}</p>
        <p className="text-xs text-muted">
          {running ? (
            <span className="inline-flex items-center gap-1 text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> En cours · cliquez pour arrêter
            </span>
          ) : (
            "Cliquez pour démarrer"
          )}
        </p>
      </div>
      <dl className="shrink-0 space-y-0.5 text-right text-xs">
        <div className="flex items-center justify-end gap-1.5">
          <dt className="text-muted">Aujourd&apos;hui</dt>
          <dd className="font-medium tabular-nums">{formatDuration(summary.todayMs + elapsed)}</dd>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <dt className="text-muted">Semaine</dt>
          <dd className="font-medium tabular-nums">{formatDuration(summary.weekMs + elapsed)}</dd>
        </div>
      </dl>
    </div>
  );
}
