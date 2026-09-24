"use client";

import { useApp } from "@/components/layout/app-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { DueBadge, PriorityBadge } from "@/components/ui/badges";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Carte de tâche du Kanban (présentation pure, le glisser-déposer est géré par le parent). */
export function TaskCard({ task, showProject, dragging }: { task: TaskView; showProject?: boolean; dragging?: boolean }) {
  const { membersById, today } = useApp();
  const assignees = task.assigneeIds.map((id) => membersById.get(id)).filter((m) => !!m);
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-3 text-left transition-shadow",
        dragging ? "rotate-1 shadow-xl ring-2 ring-accent/40" : "hover:shadow-md",
      )}
    >
      {showProject && (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: task.projectColor }} />
          <span className="truncate">{task.projectName}</span>
        </div>
      )}
      <p className={cn("text-sm leading-snug font-medium", done && "text-muted line-through")}>{task.title}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <PriorityBadge priority={task.priority} compact />
        <DueBadge dueDate={task.dueDate} today={today} done={done} />
        <span className="ml-auto">
          <AvatarStack users={assignees} />
        </span>
      </div>
    </div>
  );
}
