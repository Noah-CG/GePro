"use client";

import { Check } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { removeImportantDay, saveImportantDay } from "@/actions/important-days";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { DEFAULT_IMPORTANT_DAY_COLOR, IMPORTANT_DAY_COLORS, IMPORTANT_DAY_TITLE_MAX } from "@/lib/constants";
import { formatWeekdayDayMonth } from "@/lib/dates";
import type { ImportantDayView } from "@/lib/queries";

const FORM_ID = "important-day-form";

/**
 * Fenêtre pour marquer une date comme journée importante, ou modifier / retirer une journée déjà
 * marquée. Ouverte depuis le calendrier (date déjà choisie), le tableau de bord ou la liste des
 * journées importantes. Tout membre peut créer, modifier ou retirer une journée.
 */
export function ImportantDayDialog({
  open,
  onOpenChange,
  projectId,
  date,
  day,
  pickDate = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Date de la nouvelle journée (proposée par défaut si `pickDate`). */
  date: string;
  /** Journée existante, à modifier. */
  day?: ImportantDayView;
  /** Affiche un champ Date pour une nouvelle journée ouverte sans jour choisi (bouton « Ajouter »). */
  pickDate?: boolean;
}) {
  const { toast } = useApp();
  const showDatePicker = pickDate && !day;
  const [draft, setDraft] = useState({
    date: day?.date ?? date,
    title: day?.title ?? "",
    description: day?.description ?? "",
    color: day?.color ?? DEFAULT_IMPORTANT_DAY_COLOR,
  });
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();
  const pending = saving || removing;
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.title.trim() ? null : "Le titre est obligatoire";
    const dateMissing = draft.date ? null : "Choisissez une date";
    setTitleError(title);
    setDateError(dateMissing);
    setError(null);
    if (title || dateMissing) return;
    startSaving(async () => {
      const res = await saveImportantDay(day?.id ?? null, { ...draft, projectId });
      if (!res.ok) return showDatePicker ? setDateError(res.error) : setError(res.error);
      toast(day ? "Journée importante mise à jour" : "Journée marquée comme importante");
      onOpenChange(false);
    });
  }

  function remove() {
    if (!day) return;
    if (!confirmRemove) return setConfirmRemove(true);
    startRemoving(async () => {
      const res = await removeImportantDay(day.id);
      if (!res.ok) {
        setConfirmRemove(false);
        return setError(res.error);
      }
      toast("Journée importante retirée");
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={day ? "Modifier la journée importante" : "Nouvelle journée importante"}
      description={showDatePicker || !draft.date ? undefined : formatWeekdayDayMonth(draft.date)}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {day && (
            <Button
              variant={confirmRemove ? "danger" : "ghost"}
              size="sm"
              className={confirmRemove ? undefined : "text-danger hover:text-danger"}
              onClick={remove}
              onBlur={() => setConfirmRemove(false)}
              disabled={pending}
              loading={removing}
            >
              {confirmRemove ? "Confirmer le retrait" : "Retirer la journée importante"}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={pending} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-4">
        <Field label="Titre" htmlFor="important-day-title">
          <Input
            id="important-day-title"
            autoFocus
            required
            value={draft.title}
            onChange={(e) => {
              set("title", e.target.value);
              setTitleError(null);
            }}
            maxLength={IMPORTANT_DAY_TITLE_MAX}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "important-day-title-error" : undefined}
          />
          {titleError && (
            <p id="important-day-title-error" className="text-xs text-danger">
              {titleError}
            </p>
          )}
        </Field>
        {showDatePicker && (
          <Field label="Date" htmlFor="important-day-date">
            <DatePicker
              id="important-day-date"
              value={draft.date}
              onChange={(v) => {
                set("date", v);
                setDateError(null);
              }}
              placeholder="Choisir une date"
            />
            {dateError && <p className="text-xs text-danger">{dateError}</p>}
          </Field>
        )}
        <Field label="Description (optionnel)" htmlFor="important-day-description">
          <Textarea
            id="important-day-description"
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={2000}
            className="min-h-0!"
          />
        </Field>
        <Field label="Couleur">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur">
            {IMPORTANT_DAY_COLORS.map((c) => {
              const selected = draft.color === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => set("color", c.value)}
                  className="flex h-7 w-7 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
                  style={{ background: c.value, boxShadow: selected ? "0 0 0 2px var(--surface), 0 0 0 4px var(--text)" : undefined }}
                >
                  {selected && <Check size={14} className="text-white" aria-hidden />}
                </button>
              );
            })}
          </div>
        </Field>

        {error && <p className="text-xs text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
