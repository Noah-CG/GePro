"use client";

import { CheckCircle2, NotebookPen, Pencil } from "lucide-react";
import { useState } from "react";
import { WorkNoteDialog, type NoteTarget } from "@/components/dashboard/work-note-dialog";
import { cn } from "@/lib/utils";

/** Période de l'historique, avec ses libellés déjà formatés par le serveur (fuseau de l'équipe). */
export type WorkSessionItem = {
  id: string;
  /** "24 sept. 2026 à 14:32 → 15:52" */
  label: string;
  durationLabel: string;
  running: boolean;
  projectName: string | null;
  projectColor: string | null;
  note: string;
};

/**
 * Historique des périodes de travail et de leur journal de bord. `editable` : fiche de
 * l'utilisateur connecté, qui peut rédiger ou modifier le journal de ses périodes terminées.
 */
export function WorkSessionList({ sessions, editable }: { sessions: WorkSessionItem[]; editable: boolean }) {
  const [target, setTarget] = useState<NoteTarget | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sessions.length === 0) return <p className="p-4 text-sm text-muted">Le chrono n&apos;a encore jamais été lancé.</p>;

  const edit = (s: WorkSessionItem) => setTarget({ id: s.id, label: `${s.label} · ${s.durationLabel}`, note: s.note });

  return (
    <>
      <ul className="divide-y divide-border">
        {sessions.map((s) => (
          <li key={s.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-center gap-3">
              {s.running ? (
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success" />
              ) : (
                <CheckCircle2 size={14} className="shrink-0 text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate">{s.label}</p>
                {s.projectName && (
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.projectColor ?? undefined }} />
                    <span className="truncate">{s.projectName}</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums">{s.durationLabel}</span>
              {editable && !s.running && s.note && (
                <button onClick={() => edit(s)} aria-label="Modifier le journal" title="Modifier le journal" className="shrink-0 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text">
                  <Pencil size={13} />
                </button>
              )}
            </div>

            {s.note ? (
              <button
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                aria-expanded={expanded === s.id}
                className={cn(
                  "mt-1.5 ml-[26px] block w-[calc(100%-26px)] rounded-md bg-surface-2 px-2.5 py-1.5 text-left text-xs whitespace-pre-line text-text/90",
                  expanded !== s.id && "line-clamp-3",
                )}
              >
                {s.note}
              </button>
            ) : (
              editable &&
              !s.running && (
                <button onClick={() => edit(s)} className="mt-1 ml-[26px] inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  <NotebookPen size={12} /> Rédiger le journal
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      <WorkNoteDialog key={target?.id} target={target} onClose={() => setTarget(null)} />
    </>
  );
}
