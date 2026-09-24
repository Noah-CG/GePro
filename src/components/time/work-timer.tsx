"use client";

import { CheckCircle2, NotebookPen, Play, Square, X } from "lucide-react";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { startWorkTimer, stopWorkTimer, type StoppedSession } from "@/actions/work-sessions";
import { WorkNoteDialog, type NoteTarget } from "@/components/time/work-note-dialog";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { formatClock, formatDuration } from "@/lib/dates";
import type { WorkSummary } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Chrono de temps de travail : un clic pour démarrer, un clic pour arrêter. L'état vit en base
 * (il survit à un rechargement et se retrouve sur un autre appareil) ; l'affichage défile ici.
 * À l'arrêt, un bandeau propose de rédiger le journal de bord de la période écoulée.
 * `large` : version mise en avant (vue « Mes tâches »).
 */
export function WorkTimer({ summary, large }: { summary: WorkSummary; large?: boolean }) {
  const { toast } = useApp();
  const [pending, startTransition] = useTransition();
  const [runningSince, setRunningSince] = useOptimistic(summary.runningSince);
  // Heure courante, connue seulement après l'hydratation (évite un écart serveur / navigateur).
  const [now, setNow] = useState<number | null>(null);
  // Dernière période arrêtée, en attente de son journal.
  const [stopped, setStopped] = useState<StoppedSession | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);

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
      if (!running) {
        setStopped(null);
        const res = await startWorkTimer();
        if (!res.ok) toast(res.error, "error");
        return;
      }
      const res = await stopWorkTimer();
      if (!res.ok) toast(res.error, "error");
      else setStopped(res.data);
    });
  }

  return (
    <>
      <div className={cn("flex items-center", large ? "gap-5 p-5" : "gap-4 p-4")}>
        <button
          onClick={toggle}
          disabled={pending}
          aria-pressed={running}
          aria-label={running ? "Arrêter le chrono" : "Démarrer le chrono"}
          className={cn(
            large ? "h-20 w-20" : "h-14 w-14",
            "flex shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-60",
            running ? "bg-danger" : "bg-success",
          )}
        >
          {running ? <Square size={large ? 26 : 20} fill="currentColor" /> : <Play size={large ? 30 : 22} fill="currentColor" className="ml-1" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("font-mono font-semibold tabular-nums", large ? "text-4xl" : "text-2xl", !running && "text-muted")}>{formatClock(elapsed)}</p>
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
        <dl className={cn("shrink-0 space-y-0.5 text-right", large ? "text-sm" : "text-xs")}>
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
      {stopped && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-success-soft px-4 py-2.5 text-sm">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <CheckCircle2 size={15} className="shrink-0 text-success" />
            <span className="truncate">{formatDuration(stopped.durationMs)} enregistrées</span>
          </span>
          <Button size="sm" variant="primary" onClick={() => setNoteTarget({ id: stopped.id, label: `Session de ${formatDuration(stopped.durationMs)}`, note: "" })}>
            <NotebookPen size={14} /> Rédiger le journal
          </Button>
          <button onClick={() => setStopped(null)} aria-label="Ignorer" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text">
            <X size={15} />
          </button>
        </div>
      )}
      <WorkNoteDialog
        key={noteTarget?.id}
        target={noteTarget}
        onClose={(saved) => {
          setNoteTarget(null);
          if (saved) setStopped(null);
        }}
      />
    </>
  );
}
