"use client";

import { Columns3, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/layout/app-provider";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { applyFilters, DEFAULT_FILTERS, FilterBar, type DueFilter, type TaskFilters } from "./filters";
import { KanbanBoard } from "./kanban-board";
import { TaskList } from "./task-list";

/**
 * Bloc "tâches" réutilisé sur la page Tâches et sur chaque page projet :
 * bascule Kanban / Liste (mémorisée dans l'URL), filtres, et ouverture directe
 * d'une tâche via ?tache=<id> (liens de la recherche et du tableau de bord).
 */
export function TaskBoard({ tasks, projectId }: { tasks: TaskView[]; projectId?: string }) {
  const { me, today, editTask } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("vue") === "liste" ? "liste" : "kanban";
  // Filtres initiaux possibles depuis l'URL (liens du tableau de bord) : ?echeance=overdue&responsable=moi
  const [filters, setFilters] = useState<TaskFilters>(() => {
    const due = params.get("echeance");
    return {
      ...DEFAULT_FILTERS,
      due: (["overdue", "today", "week", "none"] as DueFilter[]).find((d) => d === due) ?? "all",
      assignee: params.get("responsable") === "moi" ? "me" : "all",
    };
  });

  const filtered = useMemo(() => applyFilters(tasks, filters, { meId: me.id, today }), [tasks, filters, me.id, today]);

  const setView = (v: "kanban" | "liste") => {
    const next = new URLSearchParams(params);
    if (v === "kanban") next.delete("vue");
    else next.set("vue", v);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  // Ouverture directe d'une tâche depuis un lien.
  const taskParam = params.get("tache");
  useEffect(() => {
    if (!taskParam) return;
    const task = tasks.find((t) => t.id === taskParam);
    if (task) editTask(task);
    const next = new URLSearchParams(params);
    next.delete("tache");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskParam]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterBar filters={filters} onChange={setFilters} showProject={!projectId} showStatus={view === "liste"} />
        <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Vue">
          {(
            [
              { v: "kanban", label: "Kanban", icon: Columns3 },
              { v: "liste", label: "Liste", icon: List },
            ] as const
          ).map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm",
                view === v ? "bg-surface-2 font-medium" : "text-muted hover:text-text",
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard tasks={filtered} projectId={projectId} showProject={!projectId} />
      ) : (
        <TaskList tasks={filtered} showProject={!projectId} />
      )}
    </div>
  );
}
