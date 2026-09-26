"use client";

import { Check, Star, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { removeImportantDay, saveImportantDay } from "@/actions/important-days";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { DEFAULT_IMPORTANT_DAY_COLOR, IMPORTANT_DAY_COLORS, IMPORTANT_DAY_TITLE_MAX } from "@/lib/constants";
import type { ImportantDayView } from "@/lib/queries";

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Date proposée pour une nouvelle journée ("" : à choisir). */
  date: string;
  /** Journée existante, à modifier. */
  day?: ImportantDayView;
}) {
  const { toast } = useApp();
  const [draft, setDraft] = useState({
    date: day?.date ?? date,
    title: day?.title ?? "",
    description: day?.description ?? "",
    color: day?.color ?? DEFAULT_IMPORTANT_DAY_COLOR,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();
  const pending = saving || removing;
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    startSaving(async () => {
      const res = await saveImportantDay(day?.id ?? null, { ...draft, projectId });
      if (!res.ok) return setError(res.error);
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
    <Dialog open={open} onOpenChange={onOpenChange} title={day ? "Modifier la journée importante" : "Marquer comme journée importante"}>
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        className="space-y-4"
      >
        {/* Aperçu de la case du calendrier : le rendu final, dans la couleur choisie. */}
        <div
          aria-hidden
          className="flex h-16 items-center justify-center gap-2 rounded-lg px-3 text-center text-lg leading-tight font-bold text-white"
          style={{ background: draft.color }}
        >
          <Star size={16} className="shrink-0 fill-current" />
          <span className="line-clamp-2">{draft.title.trim() || "Titre de la journée"}</span>
        </div>

        <Field label={`Titre (${draft.title.length}/${IMPORTANT_DAY_TITLE_MAX})`} htmlFor="important-day-title">
          <Input
            id="important-day-title"
            autoFocus
            required
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={IMPORTANT_DAY_TITLE_MAX}
            placeholder="Ex. Lancement du site"
          />
        </Field>
        <Field label="Date" htmlFor="important-day-date">
          <DatePicker id="important-day-date" value={draft.date} onChange={(v) => set("date", v)} placeholder="Choisir une date" />
        </Field>
        <Field label="Description (facultatif)" htmlFor="important-day-description">
          <Textarea
            id="important-day-description"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={2000}
            placeholder="Affichée au survol de la case du calendrier"
            className="min-h-20"
          />
        </Field>
        <Field label="Couleur">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur">
            {IMPORTANT_DAY_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={draft.color === c.value}
                aria-label={c.label}
                title={c.label}
                onClick={() => set("color", c.value)}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110"
                style={{ background: c.value, boxShadow: draft.color === c.value ? `0 0 0 2px var(--surface), 0 0 0 4px ${c.value}` : undefined }}
              >
                {draft.color === c.value && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {day && (
            <Button variant={confirmRemove ? "danger" : "ghost"} size="sm" onClick={remove} onBlur={() => setConfirmRemove(false)} disabled={pending} loading={removing}>
              <Trash2 size={14} />
              {confirmRemove ? "Confirmer le retrait" : "Retirer"}
            </Button>
          )}
          <span className="ml-auto hidden items-center gap-1 text-xs text-muted sm:flex">
            <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> pour enregistrer
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={pending || !draft.title.trim() || !draft.date} loading={saving}>
              {day ? "Enregistrer" : "Marquer la journée"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
