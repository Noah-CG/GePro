"use client";

import { CalendarPlus, Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { createTask, deleteTask, getTaskOptions, moveTask, updateTask, type TaskOption } from "@/actions/tasks";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import { useApp } from "@/components/layout/app-provider";
import { PRIORITY_DOT, StatusIcon } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input, Segmented, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { SimpleSelect } from "@/components/ui/select";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { googleCalendarUrl } from "@/lib/google-calendar";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { AssigneePicker } from "./assignee-picker";
import { DependencyPicker } from "./task-links";

/** Valeur du sélecteur de tâche parente pour « aucune » (Radix Select refuse la chaîne vide). */
const NO_PARENT = "aucune";

const FORM_ID = "formulaire-tache";

export type TaskDraft = {
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string;
  dueDate: string;
  assigneeIds: string[];
  /** "" = tâche de premier niveau. */
  parentId: string;
  dependsOnIds: string[];
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
  const { projects, toast, newTask } = useApp();
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
    startDate: task?.startDate ?? defaults?.startDate ?? "",
    dueDate: task?.dueDate ?? defaults?.dueDate ?? "",
    assigneeIds: task?.assigneeIds ?? defaults?.assigneeIds ?? [],
    parentId: task?.parentId ?? defaults?.parentId ?? "",
    dependsOnIds: task?.dependsOnIds ?? defaults?.dependsOnIds ?? [],
  }));
  // Tâches du projet choisi : candidates comme parente ou prérequis, et sous-tâches existantes.
  const [projectTasks, setProjectTasks] = useState<TaskOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const pending = saving || deleting;

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    if (!open || !draft.projectId) return;
    let cancelled = false;
    getTaskOptions(draft.projectId).then((options) => !cancelled && setProjectTasks(options));
    return () => {
      cancelled = true;
    };
  }, [open, draft.projectId]);


  const others = projectTasks.filter((t) => t.id !== task?.id);
  const subtasks = task ? projectTasks.filter((t) => t.parentId === task.id) : [];
  // Un seul niveau : seules les tâches de premier niveau peuvent être parentes, et une tâche
  // qui a des sous-tâches ne peut pas en devenir une.
  const parentOptions = others.filter((t) => !t.parentId);
  const canHaveParent = subtasks.length === 0 && (task?.subtasks.total ?? 0) === 0;
  const blockers = others.filter((t) => draft.dependsOnIds.includes(t.id) && t.status !== "done");

  function toggleSubtask(sub: TaskOption) {
    const status = sub.status === "done" ? "todo" : "done";
    setProjectTasks((list) => list.map((t) => (t.id === sub.id ? { ...t, status } : t)));
    moveTask(sub.id, status).then((res) => {
      if (!res.ok) {
        toast(res.error, "error");
        setProjectTasks((list) => list.map((t) => (t.id === sub.id ? { ...t, status: sub.status } : t)));
      }
    });
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    startSaving(async () => {
      const res = task ? await updateTask(task.id, draft) : await createTask(draft);
      if (!res.ok) return setError(res.error);
      toast(task ? "Tâche mise à jour" : "Tâche créée");
      onOpenChange(false);
    });
  }

  function remove() {
    if (!task) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startDeleting(async () => {
      const res = await deleteTask(task.id);
      if (!res.ok) return setError(res.error);
      toast("Tâche supprimée");
      onOpenChange(false);
    });
  }

  const projectName = projects.find((p) => p.id === draft.projectId)?.name;

  // Reprend les valeurs affichées dans la fenêtre, même pas encore enregistrées.
  const calendarUrl = googleCalendarUrl({
    ...draft,
    projectName,
    link: task && typeof window !== "undefined" ? `${window.location.origin}/projets/${task.projectId}?tache=${task.id}` : undefined,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? "Modifier la tâche" : "Nouvelle tâche"}
      // Pas de choix du projet : la tâche appartient au projet dans lequel on travaille.
      description={projectName ? `Projet ${projectName}` : undefined}
      footer={
        activeProjects.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            {task ? (
              <Button variant={confirmDelete ? "danger" : "ghost"} size="sm" onClick={remove} disabled={pending} loading={deleting}>
                <Trash2 size={14} />
                {!confirmDelete
                  ? "Supprimer"
                  : subtasks.length
                    ? `Supprimer avec ${subtasks.length > 1 ? `ses ${subtasks.length} sous-tâches` : "sa sous-tâche"}`
                    : "Confirmer la suppression"}
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
              {/* Hors du formulaire (barre du bas de la fenêtre) : relié par son id. */}
              <Button type="submit" form={FORM_ID} variant="primary" disabled={pending || !draft.title.trim()} loading={saving}>
                {task ? "Enregistrer" : "Créer la tâche"}
              </Button>
            </div>
          </div>
        )
      }
    >
      {activeProjects.length === 0 ? (
        <p className="text-sm text-muted">Créez d'abord un projet pour pouvoir y ajouter des tâches.</p>
      ) : (
        <form
          id={FORM_ID}
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
            rows={2}
            // `!` : l'emporte sur la hauteur minimale par défaut du champ.
            className="min-h-14!"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Début" htmlFor="task-start">
              <DatePicker id="task-start" value={draft.startDate} onChange={(v) => set("startDate", v)} placeholder="Sans date de début" />
            </Field>
            <Field label="Échéance" htmlFor="task-due">
              <DatePicker id="task-due" value={draft.dueDate} onChange={(v) => set("dueDate", v)} placeholder="Sans échéance" />
            </Field>
          </div>
          <div className="-mt-2 flex justify-center">
            {calendarUrl ? (
              <a
                href={calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvre Google Agenda avec l'événement pré-rempli (dates, description, lien vers la tâche)"
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
              >
                <CalendarPlus size={12} /> Ajouter à Google Agenda
              </a>
            ) : (
              <span
                title="Choisissez une date de début ou une échéance pour l'ajouter à Google Agenda"
                className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted opacity-50"
              >
                <CalendarPlus size={12} /> Ajouter à Google Agenda
              </span>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sous-tâche de" htmlFor="task-parent">
              {canHaveParent ? (
                <SimpleSelect
                  id="task-parent"
                  value={draft.parentId || NO_PARENT}
                  onValueChange={(v) => set("parentId", v === NO_PARENT ? "" : v)}
                  options={[
                    { value: NO_PARENT, label: "Aucune (tâche principale)" },
                    // La parente actuelle reste affichée pendant le chargement de la liste.
                    ...(draft.parentId && !parentOptions.some((t) => t.id === draft.parentId)
                      ? [{ value: draft.parentId, label: task?.parentTitle ?? "…" }]
                      : []),
                    ...parentOptions.map((t) => ({ value: t.id, label: t.title })),
                  ]}
                />
              ) : (
                <p className="text-xs text-muted">Cette tâche a des sous-tâches : elle ne peut pas devenir une sous-tâche.</p>
              )}
            </Field>
            <Field label="Dépend de">
              <DependencyPicker value={draft.dependsOnIds} onChange={(ids) => set("dependsOnIds", ids)} options={others} />
            </Field>
          </div>
          {blockers.length > 0 && draft.status !== "done" && (
            <p className="-mt-2 flex items-start gap-1.5 text-xs text-warning">
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>
                En attente de {blockers.length > 1 ? "ces tâches" : "cette tâche"} : {blockers.map((b) => b.title).join(", ")}
              </span>
            </p>
          )}

          {!draft.parentId && (
            <Field label={`Sous-tâches${subtasks.length ? ` (${subtasks.filter((t) => t.status === "done").length}/${subtasks.length})` : ""}`}>
              <ul className="space-y-0.5">
                {subtasks.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm">
                    <button
                      type="button"
                      onClick={() => toggleSubtask(sub)}
                      aria-label={sub.status === "done" ? "Marquer comme à faire" : "Marquer comme terminée"}
                    >
                      <StatusIcon status={sub.status} size={16} />
                    </button>
                    <span className={cn("truncate", sub.status === "done" && "text-muted line-through")}>{sub.title}</span>
                  </li>
                ))}
              </ul>
              {/* À la création, la tâche n'existe pas encore : même bouton, désactivé. */}
              <button
                type="button"
                disabled={!task}
                title={task ? undefined : "Disponible une fois la tâche créée"}
                onClick={() => task && newTask({ projectId: task.projectId, parentId: task.id, assigneeIds: task.assigneeIds })}
                className="mt-1 inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted"
              >
                <Plus size={12} /> Ajouter une sous-tâche
              </button>
              {!task && <p className="mt-1 text-xs text-muted">Vous pourrez ajouter des sous-tâches une fois la tâche créée.</p>}
            </Field>
          )}

          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        </form>
      )}
    </Dialog>
  );
}
