"use client";

import { AlertCircle, CalendarClock } from "lucide-react";
import { useApp } from "@/components/layout/app-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { StatusIcon } from "@/components/ui/badges";
import { STATUS_LABEL } from "@/lib/constants";
import type { CalendarEvent, TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";

const chip =
  "flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

/**
 * Tâche dans une case du calendrier : liseré à la couleur du projet, avatars des responsables.
 * Terminée : barrée et atténuée. En retard : icône d'alerte (pas seulement une couleur).
 * Le clic ouvre le TaskDialog existant, sans déclencher la création d'un événement sur le jour.
 */
export function TaskChip({ task, tabIndex, onOpen }: { task: TaskView; tabIndex?: number; onOpen: (task: TaskView) => void }) {
  const { membersById, today } = useApp();
  const assignees = task.assigneeIds.map((id) => membersById.get(id)).filter((m) => !!m);
  const done = task.status === "done";
  const overdue = !done && !!task.dueDate && task.dueDate < today;

  const label = [
    `Tâche : ${task.title}`,
    STATUS_LABEL[task.status],
    overdue && "en retard",
    assignees.length > 0 && `responsables : ${assignees.map((m) => m.name).join(", ")}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-label={label}
      title={task.title}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      className={cn(chip, "border border-l-[3px] border-border bg-surface hover:bg-surface-2", done && "opacity-60")}
      style={{ borderLeftColor: task.projectColor }}
    >
      {overdue ? <AlertCircle size={12} className="shrink-0 text-danger" aria-hidden /> : <StatusIcon status={task.status} size={12} />}
      <span className={cn("min-w-0 flex-1 truncate", done && "line-through")}>{task.title}</span>
      <AvatarStack users={assignees} max={2} size={16} />
    </button>
  );
}

/**
 * Événement dans une case du calendrier : fond teinté de sa couleur et icône de calendrier,
 * pour le distinguer d'une tâche même sans voir les couleurs.
 */
export function EventChip({ event, tabIndex, onOpen }: { event: CalendarEvent; tabIndex?: number; onOpen: (event: CalendarEvent) => void }) {
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-label={`Événement : ${event.title} (${event.projectName})`}
      title={event.title}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(event);
      }}
      className={cn(chip, "font-medium hover:brightness-95 dark:hover:brightness-125")}
      style={{ background: `color-mix(in srgb, ${event.color} 18%, transparent)` }}
    >
      <CalendarClock size={12} className="shrink-0" style={{ color: event.color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
    </button>
  );
}
