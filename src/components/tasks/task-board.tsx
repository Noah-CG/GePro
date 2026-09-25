"use client";

import { ChartGantt, Columns3, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useApp } from "@/components/layout/app-provider";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { applyFilters, FilterBar, filtersFromParams, filtersToParams, type TaskFilters } from "./filters";
import { GanttChart } from "./gantt-chart";
import { KanbanBoard } from "./kanban-board";
import { TaskList } from "./task-list";

type View = "kanban" | "liste" | "gantt";

/**
 * Bloc "tâches" réutilisé sur la page Tâches et sur chaque page projet :
 * bascule Kanban / Liste / Gantt et filtres (mémorisés dans l'URL, donc par onglet), et ouverture
 * directe d'une tâche via ?tache=<id> (liens de la recherche et du tableau de bord).
 */
export function TaskBoard({ tasks, projectId }: { tasks: TaskView[]; projectId?: string }) {
  const { me, today, editTask } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const vue = params.get("vue");
  const view: View = vue === "liste" || vue === "gantt" ? vue : "kanban";
  // Les filtres vivent dans l'URL (ex. liens du tableau de bord : ?echeance=overdue&responsable=moi).
  const filters = useMemo(() => filtersFromParams(params), [params]);

  // history.replaceState : Next met à jour useSearchParams sans aller-retour serveur ni entrée
  // d'historique à chaque frappe.
  const setFilters = (next: TaskFilters) => {
    const query = filtersToParams(next, new URLSearchParams(params.toString()));
    window.history.replaceState(null, "", `${pathname}${query.size ? `?${query}` : ""}`);
  };

  const filtered = useMemo(() => applyFilters(tasks, filters, { meId: me.id, today }), [tasks, filters, me.id, today]);

  const setView = (v: View) => {
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
      {/* Dès sm, les filtres passent à la ligne dans leur zone : le sélecteur de vue reste en haut
          à droite, même quand le filtre « Statut » (Liste et Gantt) allonge la barre. */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 flex-1">
          <FilterBar filters={filters} onChange={setFilters} showProject={!projectId} showStatus={view !== "kanban"} />
        </div>
        <div className="flex shrink-0 rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Vue">
          {(
            [
              { v: "kanban", label: "Kanban", icon: Columns3 },
              { v: "liste", label: "Liste", icon: List },
              { v: "gantt", label: "Gantt", icon: ChartGantt },
            ] as const
          ).map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              aria-label={label}
              title={label}
              onClick={() => setView(v)}
              className={cn(
                "flex h-6 items-center gap-1.5 rounded-md px-2 text-xs",
                view === v ? "bg-surface-2 font-medium" : "text-muted hover:text-text",
              )}
            >
              {/* Libellé masqué quand la place manque, pour garder filtres et vues sur une ligne. */}
              <Icon size={14} /> <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard tasks={filtered} projectId={projectId} showProject={!projectId} />
      ) : view === "gantt" ? (
        <GanttChart tasks={filtered} showProject={!projectId} />
      ) : (
        <TaskList tasks={filtered} showProject={!projectId} />
      )}
    </div>
  );
}
