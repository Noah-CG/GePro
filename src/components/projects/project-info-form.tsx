"use client";

import { useState, useTransition, type FormEvent } from "react";
import { updateProject } from "@/actions/projects";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import type { ProjectWithStats } from "@/lib/queries";
import { ProjectFields, projectDraft, type ProjectDraft } from "./project-dialog";

/** Informations du projet dans ses paramètres : nom, description, dates et couleur. */
export function ProjectInfoForm({ project }: { project: ProjectWithStats }) {
  const { toast } = useApp();
  const saved = projectDraft(project);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof ProjectDraft, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = (Object.keys(saved) as (keyof ProjectDraft)[]).some((k) => draft[k] !== saved[k]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateProject(project.id, draft);
      if (!res.ok) return setError(res.error);
      toast("Projet mis à jour");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <ProjectFields draft={draft} set={set} idPrefix="project-settings" />

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(saved);
              setError(null);
            }}
          >
            Annuler les modifications
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!dirty || !draft.name.trim()} loading={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
