"use client";

import { useApp } from "@/components/layout/app-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { DueBadge, PriorityBadge } from "@/components/ui/badges";
import { DoneCheckbox, useOptimisticStatus } from "@/components/tasks/task-list";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Liste compacte de tâches du tableau de bord : cocher = terminer, clic = ouvrir. */
export function DashboardTaskList({ tasks, empty }: { tasks: TaskView[]; empty: string }) {
  const { membersById, today, editTask } = useApp();
  const [items, setStatus] = useOptimisticStatus(tasks);

  if (items.length === 0) return <p className="px-4 py-8 text-center text-sm text-muted">{empty}</p>;

  return (
    <ul className="divide-y divide-border">
      {items.map((t) => {
        const done = t.status === "done";
        const assignees = t.assigneeIds.map((id) => membersById.get(id)).filter((m) => !!m);
        return (
          <li key={t.id} onClick={() => editTask(t)} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
            <DoneCheckbox task={t} onToggle={() => setStatus(t, done ? "todo" : "done")} />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", done && "text-muted line-through")}>{t.title}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.projectColor }} />
                <span className="truncate">{t.projectName}</span>
              </p>
            </div>
            <PriorityBadge priority={t.priority} compact />
            <span className="w-24 text-right">
              <DueBadge dueDate={t.dueDate} today={today} done={done} />
            </span>
            <span className="hidden w-16 justify-end sm:flex">
              <AvatarStack users={assignees} max={2} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
