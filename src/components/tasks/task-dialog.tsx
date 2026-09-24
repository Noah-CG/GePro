"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { createTask, deleteTask, updateTask } from "@/actions/tasks";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import { useApp } from "@/components/layout/app-provider";
import { PRIORITY_DOT } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { addDays, endOfWeekISO } from "@/lib/dates";
import type { TaskView } from "@/lib/queries";
import { AssigneePicker } from "./assignee-picker";

export type TaskDraft = {
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assigneeIds: string[];
};

/** Fenêtre de création / modification d'une tâche. */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskView;
  defaults?: Partial<TaskDraft>;
}) {
  const { projects, today, toast } = useApp();
  const activeProjects = projects.filter((p) => !p.archived || p.id === task?.projectId);

  const [draft, setDraft] = useState<TaskDraft>(() => ({
    projectId:
      task?.projectId ??
      // Le projet proposé par défaut doit être actif (pas de nouvelle tâche dans un projet archivé).
      (activeProjects.some((p) => p.id === defaults?.projectId) ? defaults?.projectId : activeProjects[0]?.id) ??
      "",
    title: task?.title ?? defaults?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? defaults?.status ?? "todo",
    priority: task?.priority ?? defaults?.priority ?? "medium",
    dueDate: task?.dueDate ?? defaults?.dueDate ?? "",
    assigneeIds: task?.assigneeIds ?? defaults?.assigneeIds ?? [],
  }));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = task ? await updateTask(task.id, draft) : await createTask(draft);
      if (!res.ok) return setError(res.error);
      toast(task ? "Tâche mise à jour" : "Tâche créée");
      onOpenChange(false);
    });
  }

  function remove() {
    if (!task) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (!res.ok) return setError(res.error);
      toast("Tâche supprimée");
      onOpenChange(false);
    });
  }

  // Raccourcis de date en un clic.
  const quickDates = [
    { label: "Aujourd'hui", value: today },
    { label: "Demain", value: addDays(today, 1) },
    { label: "Fin de semaine", value: endOfWeekISO(today) === today ? addDays(today, 7) : endOfWeekISO(today) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={task ? "Modifier la tâche" : "Nouvelle tâche"}>
      {activeProjects.length === 0 ? (
        <p className="text-sm text-muted">Créez d'abord un projet pour pouvoir y ajouter des tâches.</p>
      ) : (
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Entrée enregistre depuis n'importe quel champ.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="space-y-4"
        >
          <Input
            autoFocus
            placeholder="Titre de la tâche"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            className="h-11 border-transparent bg-transparent px-0 text-base font-medium focus:border-transparent focus:ring-0"
            aria-label="Titre"
            maxLength={200}
          />
          <Textarea
            placeholder="Description (facultatif)"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            aria-label="Description"
            className="min-h-20"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Projet" htmlFor="task-project">
              <Select id="task-project" value={draft.projectId} onChange={(e) => set("projectId", e.target.value)}>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Échéance" htmlFor="task-due">
              <Input id="task-due" type="date" value={draft.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </Field>
          </div>
          <div className="-mt-2 flex flex-wrap gap-1.5 sm:justify-end">
            {quickDates.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => set("dueDate", d.value)}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
              >
                {d.label}
              </button>
            ))}
            {draft.dueDate && (
              <button type="button" onClick={() => set("dueDate", "")} className="px-1.5 text-xs text-muted hover:text-text">
                Effacer
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priorité">
              <Segmented
                label="Priorité"
                value={draft.priority}
                onChange={(v) => set("priority", v)}
                options={[...PRIORITIES].reverse().map((p) => ({ ...p, dot: PRIORITY_DOT[p.value] }))}
              />
            </Field>
            <Field label="Statut">
              <Segmented label="Statut" value={draft.status} onChange={(v) => set("status", v)} options={STATUSES} />
            </Field>
          </div>

          <Field label="Responsables">
            <AssigneePicker value={draft.assigneeIds} onChange={(ids) => set("assigneeIds", ids)} />
          </Field>

          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            {task ? (
              <Button variant={confirmDelete ? "danger" : "ghost"} size="sm" onClick={remove} disabled={pending}>
                <Trash2 size={14} />
                {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
              </Button>
            ) : (
              <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
                <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> pour enregistrer
              </span>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" disabled={pending || !draft.title.trim()}>
                {task ? "Enregistrer" : "Créer la tâche"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
}
