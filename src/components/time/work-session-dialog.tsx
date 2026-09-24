"use client";

import { Trash2 } from "lucide-react";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createWorkSession, deleteWorkSession, updateWorkSession } from "@/actions/work-sessions";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { SimpleSelect } from "@/components/ui/select";
import { TimeField } from "@/components/ui/time-field";
import { formatDuration } from "@/lib/dates";
import { clockDurationMs, endsNextDay, parseClockTime } from "@/lib/work-time";

/** Valeur du sélecteur de projet pour une période sans projet (Radix Select refuse ""). */
const NO_PROJECT = "aucun";

/** Période à corriger, avec sa date et ses heures déjà lues dans le fuseau de l'équipe par le serveur. */
export type EditableSession = {
  id: string;
  date: string;
  start: string;
  /** null : chrono en cours (la fin proposée est l'heure d'affichage de la page). */
  end: string | null;
  projectId: string | null;
  note: string;
};

/** Ouverture de la fenêtre : ajout d'une période à `userId`, ou correction de `session`. */
export type SessionTarget = { userId: string; session?: EditableSession };

/**
 * Ajout ou correction d'une période de travail : date, heures de début et de fin (fin le
 * lendemain si elle précède le début), projet et journal. À monter avec une `key` par cible.
 */
export function WorkSessionDialog({
  target,
  today,
  now,
  memberName,
  onClose,
}: {
  target: SessionTarget | null;
  today: string;
  /** Heure "HH:MM" au moment de l'affichage : fin proposée pour arrêter un chrono en cours. */
  now: string;
  /** Membre concerné, quand ce n'est pas l'utilisateur connecté. */
  memberName?: string;
  onClose: () => void;
}) {
  const { projects, currentProjectId, toast } = useApp();
  const session = target?.session;
  const hintId = useId();
  const [draft, setDraft] = useState({
    date: session?.date ?? today,
    start: session?.start ?? "",
    end: session ? (session.end ?? now) : "",
    projectId: session ? (session.projectId ?? NO_PROJECT) : (currentProjectId ?? NO_PROJECT),
    note: session?.note ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const start = parseClockTime(draft.start);
  const end = parseClockTime(draft.end);
  const duration = start && end && start !== end ? clockDurationMs(start, end) : null;

  // Projets proposés : les actifs, plus celui de la période s'il a été archivé depuis.
  const projectOptions = [
    { value: NO_PROJECT, label: "Sans projet" },
    ...projects
      .filter((p) => !p.archived || p.id === session?.projectId)
      .map((p, i) => ({ value: p.id, label: p.name, dot: p.color, separatorBefore: i === 0 })),
  ];

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!target) return;
    if (!start || !end) return setError("Saisissez les heures de début et de fin (ex. 09:30).");
    setError(null);
    const input = { ...draft, start, end, projectId: draft.projectId === NO_PROJECT ? null : draft.projectId };
    startSaving(async () => {
      const res = session ? await updateWorkSession(session.id, input) : await createWorkSession(target.userId, input);
      if (!res.ok) return setError(res.error);
      toast(session ? "Période corrigée" : "Période ajoutée");
      onClose();
    });
  }

  function remove() {
    if (!session) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startDeleting(async () => {
      const res = await deleteWorkSession(session.id);
      if (!res.ok) {
        setConfirmDelete(false);
        return setError(res.error);
      }
      toast("Période supprimée");
      onClose();
    });
  }

  const title = session ? (session.end ? "Corriger la période" : "Arrêter et corriger le chrono") : "Ajouter une période";
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={memberName ? `Temps de travail de ${memberName}` : undefined}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Field label="Date" htmlFor="session-date">
            <DatePicker id="session-date" value={draft.date} onChange={(v) => set("date", v || draft.date)} max={today} clearable={false} />
          </Field>
          <div className="w-full sm:w-28">
            <Field label="Début" htmlFor="session-start">
              <TimeField id="session-start" value={draft.start} onChange={(v) => set("start", v)} aria-describedby={hintId} />
            </Field>
          </div>
          <div className="w-full sm:w-28">
            <Field label="Fin" htmlFor="session-end">
              <TimeField id="session-end" value={draft.end} onChange={(v) => set("end", v)} aria-describedby={hintId} />
            </Field>
          </div>
        </div>
        <p id={hintId} className="-mt-2 text-xs text-muted" aria-live="polite">
          {duration !== null ? (
            <>
              Durée : <strong className="font-medium text-text">{formatDuration(duration)}</strong>
              {start && end && endsNextDay(start, end) && " · se termine le lendemain"}
            </>
          ) : (
            "Heures au format 09:30 ; une fin avant le début tombe le lendemain."
          )}
        </p>

        <Field label="Projet" htmlFor="session-project">
          <SimpleSelect id="session-project" value={draft.projectId} onValueChange={(v) => set("projectId", v)} options={projectOptions} />
        </Field>

        <Field label="Journal de bord" htmlFor="session-note">
          <Textarea
            id="session-note"
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Ce qui a été fait pendant cette période (facultatif)"
            className="min-h-24"
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {session && (
            <Button
              variant={confirmDelete ? "danger" : "ghost"}
              size="sm"
              onClick={remove}
              onBlur={() => setConfirmDelete(false)}
              disabled={saving}
              loading={deleting}
            >
              <Trash2 size={14} />
              {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
            </Button>
          )}
          <span className="ml-auto hidden items-center gap-1 text-xs text-muted sm:flex">
            <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> pour enregistrer
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={deleting} loading={saving}>
              {session ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
