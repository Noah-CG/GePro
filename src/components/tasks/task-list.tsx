"use client";

import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { moveTask } from "@/actions/tasks";
import type { TaskStatus } from "@/db/schema";
import { useApp } from "@/components/layout/app-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { DueBadge, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { sortTasks, type Sort, type SortKey } from "./filters";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: "in_progress", in_progress: "done", done: "todo" };

/** Hook : changement de statut instantané à l'écran, enregistré en arrière-plan. */
export function useOptimisticStatus(tasks: TaskView[]) {
  const { toast } = useApp();
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  // Les données serveur font foi dès qu'elles arrivent.
  useEffect(() => setOverrides({}), [tasks]);

  const withStatus = tasks.map((t) => (overrides[t.id] ? { ...t, status: overrides[t.id] } : t));
  const setStatus = (task: TaskView, status: TaskStatus) => {
    setOverrides((o) => ({ ...o, [task.id]: status }));
    moveTask(task.id, status).then((res) => {
      if (!res.ok) {
        toast(res.error, "error");
        setOverrides((o) => {
          const { [task.id]: _, ...rest } = o;
          return rest;
        });
      }
    });
  };
  return [withStatus, setStatus] as const;
}

/** Case à cocher ronde "terminé". */
export function DoneCheckbox({ task, onToggle }: { task: TaskView; onToggle: () => void }) {
  const done = task.status === "done";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={done ? "Marquer comme à faire" : "Marquer comme terminée"}
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
        done ? "border-success bg-success text-white" : "border-muted/60 hover:border-success hover:bg-success-soft",
      )}
    >
      {done && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

const COLUMNS: { key: SortKey | null; label: string; className: string }[] = [
  { key: "title", label: "Tâche", className: "" },
  { key: "project", label: "Projet", className: "hidden lg:block" },
  { key: null, label: "Responsables", className: "hidden md:block" },
  { key: "priority", label: "Priorité", className: "hidden sm:block" },
  { key: "dueDate", label: "Échéance", className: "hidden sm:block" },
  { key: "status", label: "Statut", className: "hidden sm:block" },
];

const GRID = "grid grid-cols-[1fr_auto] items-center gap-x-4 sm:grid-cols-[1fr_90px_110px_110px] md:grid-cols-[1fr_110px_90px_110px_110px] lg:grid-cols-[1fr_160px_110px_90px_110px_110px]";

/** Vue liste triable. Un clic sur une ligne ouvre la tâche ; un clic sur le statut le fait avancer. */
export function TaskList({ tasks, showProject = true }: { tasks: TaskView[]; showProject?: boolean }) {
  const { membersById, today, editTask } = useApp();
  const [sort, setSort] = useState<Sort>({ key: "dueDate", dir: "asc" });
  const [items, setStatus] = useOptimisticStatus(tasks);
  const sorted = sortTasks(items, sort);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const cols = showProject ? COLUMNS : COLUMNS.filter((c) => c.key !== "project");
  const grid = showProject ? GRID : GRID.replace("lg:grid-cols-[1fr_160px_110px_90px_110px_110px]", "");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className={cn(grid, "border-b border-border bg-surface-2/50 px-4 py-2 text-xs font-medium text-muted")}>
        {cols.map((c) =>
          c.key ? (
            <button key={c.label} onClick={() => toggleSort(c.key!)} className={cn("flex items-center gap-1 text-left whitespace-nowrap hover:text-text", c.className, sort.key === c.key && "text-text")}>
              {c.label}
              {sort.key === c.key && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
            </button>
          ) : (
            <span key={c.label} className={c.className}>
              {c.label}
            </span>
          ),
        )}
        <span className="sm:hidden" />
      </div>

      {sorted.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Aucune tâche ne correspond aux filtres.</p>}

      <ul>
        {sorted.map((t) => {
          const assignees = t.assigneeIds.map((id) => membersById.get(id)).filter((m) => !!m);
          const done = t.status === "done";
          return (
            <li
              key={t.id}
              onClick={() => editTask(t)}
              className={cn(grid, "cursor-pointer border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60")}
            >
              <div className="flex min-w-0 items-center gap-3">
                <DoneCheckbox task={t} onToggle={() => setStatus(t, done ? "todo" : "done")} />
                <div className="min-w-0">
                  <p className={cn("truncate text-sm", done && "text-muted line-through")}>{t.title}</p>
                  {/* Infos condensées sur mobile */}
                  <div className="mt-0.5 flex items-center gap-2.5 sm:hidden">
                    <PriorityBadge priority={t.priority} compact />
                    <DueBadge dueDate={t.dueDate} today={today} done={done} />
                    {showProject && <span className="truncate text-xs text-muted">{t.projectName}</span>}
                  </div>
                </div>
              </div>
              {showProject && (
                <span className="hidden min-w-0 items-center gap-1.5 text-sm text-muted lg:flex">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.projectColor }} />
                  <span className="truncate">{t.projectName}</span>
                </span>
              )}
              <span className="hidden md:block">
                {assignees.length ? <AvatarStack users={assignees} /> : <span className="text-xs text-muted">—</span>}
              </span>
              <span className="hidden sm:block">
                <PriorityBadge priority={t.priority} />
              </span>
              <span className="hidden sm:block">
                {t.dueDate ? <DueBadge dueDate={t.dueDate} today={today} done={done} /> : <span className="text-xs text-muted">—</span>}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStatus(t, NEXT_STATUS[t.status]);
                }}
                title="Cliquer pour passer au statut suivant"
                className="justify-self-start"
              >
                <StatusBadge status={t.status} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
