"use client";

import { CheckCircle2, NotebookPen, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { WorkSessionDialog, type EditableSession, type SessionTarget } from "./work-session-dialog";

/** Période de l'historique, avec ses libellés déjà formatés par le serveur (fuseau de l'équipe). */
export type WorkSessionItem = {
  /** "24 sept. 2026 à 14:32 → 15:52" */
  label: string;
  durationLabel: string;
  running: boolean;
  projectName: string | null;
  projectColor: string | null;
  /** Date, heures, projet et journal, pour la fenêtre de correction. */
  session: EditableSession;
};

/**
 * Journal de bord d'un membre : ses périodes de travail et ce qu'il y a fait. Avec `editable`
 * (le membre lui-même, ou un administrateur), chaque période se corrige ou se supprime, et
 * une période oubliée s'ajoute à la main.
 */
export function WorkJournal({
  sessions,
  total,
  editable,
  userId,
  memberName,
  today,
  now,
  historyLink,
}: {
  sessions: WorkSessionItem[];
  /** Nombre total de périodes (la liste peut n'afficher que les plus récentes). */
  total: number;
  editable: boolean;
  userId: string;
  /** Membre concerné, quand ce n'est pas l'utilisateur connecté. */
  memberName?: string;
  today: string;
  now: string;
  /** Lien « Voir tout l'historique » / « Récentes seulement ». */
  historyLink?: ReactNode;
}) {
  const [target, setTarget] = useState<SessionTarget | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const edit = (s: WorkSessionItem) => setTarget({ userId, session: s.session });

  return (
    <Section
      title="Journal de bord"
      count={total}
      action={
        <span className="flex items-center gap-3">
          {historyLink}
          {editable && (
            <Button size="sm" variant="ghost" onClick={() => setTarget({ userId })}>
              <Plus size={14} /> Ajouter une période
            </Button>
          )}
        </span>
      }
    >
      {sessions.length === 0 ? (
        <p className="p-4 text-sm text-muted">
          Le chrono n&apos;a encore jamais été lancé.
          {editable && " Une période oubliée peut s'ajouter à la main."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.session.id} className="px-4 py-2.5 text-sm">
              <div className="flex items-center gap-3">
                {s.running ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" aria-label="Chrono en cours" role="img" />
                ) : (
                  <CheckCircle2 size={14} className="shrink-0 text-muted" aria-hidden />
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
                {editable && (
                  <button
                    onClick={() => edit(s)}
                    aria-label={`Corriger la période du ${s.label}`}
                    title={s.running ? "Arrêter et corriger" : "Corriger"}
                    className="shrink-0 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>

              {s.session.note ? (
                <button
                  onClick={() => setExpanded(expanded === s.session.id ? null : s.session.id)}
                  aria-expanded={expanded === s.session.id}
                  className={cn(
                    "mt-1.5 ml-[26px] block w-[calc(100%-26px)] rounded-md bg-surface-2 px-2.5 py-1.5 text-left text-xs whitespace-pre-line text-text/90",
                    expanded !== s.session.id && "line-clamp-3",
                  )}
                >
                  {s.session.note}
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
      )}
      <WorkSessionDialog
        // La clé repart d'un formulaire neuf à chaque ouverture.
        key={target ? (target.session?.id ?? "nouvelle") : "fermee"}
        target={target}
        today={today}
        now={now}
        memberName={memberName}
        onClose={() => setTarget(null)}
      />
    </Section>
  );
}

/** Lien d'historique du journal (toutes les périodes, ou les récentes seulement). */
export function HistoryLink({ href, showAll }: { href: string; showAll: boolean }) {
  return (
    <Link href={href} scroll={false} className="text-xs text-muted hover:text-text">
      {showAll ? "Récentes seulement" : "Voir tout l'historique"}
    </Link>
  );
}
