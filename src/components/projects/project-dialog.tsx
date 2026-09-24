"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createProject, updateProject } from "@/actions/projects";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input, Textarea } from "@/components/ui/input";
import { COLORS } from "@/lib/constants";
import type { ProjectWithStats } from "@/lib/queries";

/** Fenêtre de création / modification d'un projet. */
export function ProjectDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectWithStats;
}) {
  const { toast } = useApp();
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: project?.name ?? "",
    description: project?.description ?? "",
    color: project?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (project) {
        const res = await updateProject(project.id, draft);
        if (!res.ok) return setError(res.error);
        toast("Projet mis à jour");
      } else {
        const res = await createProject(draft);
        if (!res.ok) return setError(res.error);
        toast("Projet créé");
        router.push(`/projets/${res.data.id}`);
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={project ? "Modifier le projet" : "Nouveau projet"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom" htmlFor="project-name">
          <Input id="project-name" autoFocus value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="Ex. Refonte du site web" />
        </Field>
        <Field label="Description" htmlFor="project-desc">
          <Textarea id="project-desc" value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Objectif, contexte, livrables…" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Début" htmlFor="project-start">
            <DatePicker id="project-start" value={draft.startDate} onChange={(v) => set("startDate", v)} />
          </Field>
          <Field label="Fin" htmlFor="project-end">
            <DatePicker id="project-end" value={draft.endDate} onChange={(v) => set("endDate", v)} min={draft.startDate || undefined} />
          </Field>
        </div>
        <Field label="Couleur">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("color", c)}
                className="flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110"
                style={{ background: c, boxShadow: draft.color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : undefined }}
                aria-label={`Couleur ${c}`}
                aria-pressed={draft.color === c}
              >
                {draft.color === c && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={!draft.name.trim()} loading={pending}>
            {project ? "Enregistrer" : "Créer le projet"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
