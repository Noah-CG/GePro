"use client";

import { Check, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { createEvent, deleteEvent, updateEvent } from "@/actions/events";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { SimpleSelect } from "@/components/ui/select";
import { COLORS } from "@/lib/constants";
import type { CalendarEvent } from "@/lib/queries";

/**
 * Fenêtre de création / modification d'un événement du calendrier. Seul le créateur ou un
 * admin peut modifier ou supprimer un événement : pour les autres, il s'affiche en lecture seule.
 */
export function EventDialog({
  open,
  onOpenChange,
  date,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date pré-remplie pour une création. */
  date: string;
  event?: CalendarEvent;
}) {
  const { me, projects, membersById, currentProjectId, toast } = useApp();
  const canEdit = !event || me.role === "admin" || event.createdBy === me.id;
  const creator = event?.createdBy ? membersById.get(event.createdBy) : undefined;

  const [draft, setDraft] = useState({
    title: event?.title ?? "",
    description: event?.description ?? "",
    eventDate: event?.date ?? date,
    color: event?.color ?? COLORS[0],
    projectId: event?.projectId ?? currentProjectId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const pending = saving || deleting;
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  // Projets proposés : les actifs, plus celui de l'événement s'il a été archivé depuis.
  const projectOptions = projects
    .filter((p) => !p.archived || p.id === event?.projectId)
    .map((p) => ({ value: p.id, label: p.name, dot: p.color }));

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canEdit) return;
    setError(null);
    const input = draft;
    startSaving(async () => {
      const res = event ? await updateEvent(event.id, input) : await createEvent(input);
      if (!res.ok) return setError(res.error);
      toast(event ? "Événement mis à jour" : "Événement créé");
      onOpenChange(false);
    });
  }

  function remove() {
    if (!event) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startDeleting(async () => {
      const res = await deleteEvent(event.id);
      if (!res.ok) {
        setConfirmDelete(false);
        return setError(res.error);
      }
      toast("Événement supprimé");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={event ? (canEdit ? "Modifier l'événement" : "Événement") : "Nouvel événement"}>
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="space-y-4"
      >
        <fieldset disabled={!canEdit} className="space-y-4">
          <Field label="Titre" htmlFor="event-title">
            <Input
              id="event-title"
              autoFocus
              required
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={200}
              placeholder="Ex. Comité de pilotage"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="event-date">
              <DatePicker id="event-date" value={draft.eventDate} onChange={(v) => set("eventDate", v)} placeholder="Choisir une date" />
            </Field>
            <Field label="Projet" htmlFor="event-project">
              <SimpleSelect id="event-project" value={draft.projectId} onValueChange={(v) => set("projectId", v)} options={projectOptions} />
            </Field>
          </div>
          <Field label="Description" htmlFor="event-description">
            <Textarea
              id="event-description"
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Lieu, ordre du jour, participants…"
              className="min-h-20"
            />
          </Field>
          <Field label="Couleur">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className="flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110 disabled:hover:scale-100"
                  style={{ background: c, boxShadow: draft.color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : undefined }}
                  aria-label={`Couleur ${c}`}
                  aria-pressed={draft.color === c}
                >
                  {draft.color === c && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>
          </Field>
        </fieldset>

        {!canEdit && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
            Seul le créateur de l&apos;événement{creator && ` (${creator.name})`} ou un administrateur peut le modifier ou le supprimer.
          </p>
        )}
        {canEdit && event && creator && creator.id !== me.id && <p className="text-xs text-muted">Créé par {creator.name}</p>}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {event && canEdit && (
            <Button variant={confirmDelete ? "danger" : "ghost"} size="sm" onClick={remove} onBlur={() => setConfirmDelete(false)} disabled={pending} loading={deleting}>
              <Trash2 size={14} />
              {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
            </Button>
          )}
          {canEdit && (
            <span className="ml-auto hidden items-center gap-1 text-xs text-muted sm:flex">
              <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> pour enregistrer
            </span>
          )}
          <div className={canEdit ? "flex gap-2" : "ml-auto flex gap-2"}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {canEdit ? "Annuler" : "Fermer"}
            </Button>
            {canEdit && (
              <Button type="submit" variant="primary" disabled={pending || !draft.title.trim() || !draft.eventDate} loading={saving}>
                {event ? "Enregistrer" : "Créer l'événement"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
