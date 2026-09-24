"use client";

import { SlidersHorizontal, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import { useApp } from "@/components/layout/app-provider";
import { PRIORITIES, PRIORITY_RANK, STATUSES, STATUS_RANK } from "@/lib/constants";
import { endOfWeekISO } from "@/lib/dates";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";

export type DueFilter = "all" | "overdue" | "today" | "week" | "none";

export type TaskFilters = {
  q: string;
  /** "all", "me", "none" (non assignées) ou l'id d'un membre. */
  assignee: string;
  priority: "all" | TaskPriority;
  status: "all" | TaskStatus;
  due: DueFilter;
  project: string;
};

export const DEFAULT_FILTERS: TaskFilters = { q: "", assignee: "all", priority: "all", status: "all", due: "all", project: "all" };

const DUE_FILTERS: DueFilter[] = ["overdue", "today", "week", "none"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined => allowed.find((v) => v === value);

/**
 * Filtres lus dans l'adresse : ?recherche=…&responsable=moi|aucun|<id>&priorite=…&statut=…
 * &echeance=…&projet=<id>. Garder les filtres dans l'adresse les conserve d'un onglet à l'autre,
 * au rechargement, et dans un lien partagé. Toute valeur inconnue est ignorée.
 */
export function filtersFromParams(params: URLSearchParams): TaskFilters {
  const assignee = params.get("responsable");
  const project = params.get("projet");
  return {
    q: params.get("recherche") ?? "",
    assignee: assignee === "moi" ? "me" : assignee === "aucun" ? "none" : assignee && UUID.test(assignee) ? assignee : "all",
    priority: oneOf(params.get("priorite"), PRIORITIES.map((p) => p.value)) ?? "all",
    status: oneOf(params.get("statut"), STATUSES.map((st) => st.value)) ?? "all",
    due: oneOf(params.get("echeance"), DUE_FILTERS) ?? "all",
    project: project && UUID.test(project) ? project : "all",
  };
}

/** Écrit les filtres dans les paramètres d'adresse (les autres paramètres, comme ?vue, sont gardés). */
export function filtersToParams(filters: TaskFilters, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  const put = (key: string, value: string, isDefault: boolean) => (isDefault ? next.delete(key) : next.set(key, value));
  put("recherche", filters.q, filters.q === "");
  put("responsable", filters.assignee === "me" ? "moi" : filters.assignee === "none" ? "aucun" : filters.assignee, filters.assignee === "all");
  put("priorite", filters.priority, filters.priority === "all");
  put("statut", filters.status, filters.status === "all");
  put("echeance", filters.due, filters.due === "all");
  put("projet", filters.project, filters.project === "all");
  return next;
}

export type SortKey = "dueDate" | "priority" | "status" | "title" | "project";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

/** Applique les filtres (côté client : une petite équipe a au plus quelques centaines de tâches). */
export function applyFilters(tasks: TaskView[], f: TaskFilters, ctx: { meId: string; today: string }): TaskView[] {
  const q = f.q.trim().toLowerCase();
  const weekEnd = endOfWeekISO(ctx.today);
  return tasks.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    if (f.project !== "all" && t.projectId !== f.project) return false;
    if (f.priority !== "all" && t.priority !== f.priority) return false;
    if (f.status !== "all" && t.status !== f.status) return false;
    if (f.assignee === "me" && !t.assigneeIds.includes(ctx.meId)) return false;
    if (f.assignee === "none" && t.assigneeIds.length > 0) return false;
    if (!["all", "me", "none"].includes(f.assignee) && !t.assigneeIds.includes(f.assignee)) return false;
    switch (f.due) {
      case "overdue":
        return t.status !== "done" && !!t.dueDate && t.dueDate < ctx.today;
      case "today":
        return t.dueDate === ctx.today;
      case "week":
        return !!t.dueDate && t.dueDate >= ctx.today && t.dueDate <= weekEnd;
      case "none":
        return !t.dueDate;
    }
    return true;
  });
}

export function sortTasks(tasks: TaskView[], sort: Sort): TaskView[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const cmp = (a: TaskView, b: TaskView): number => {
    switch (sort.key) {
      case "dueDate":
        // Les tâches terminées puis celles sans échéance sont toujours en dernier.
        if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
        if (a.dueDate === b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate < b.dueDate ? -dir : dir;
      case "priority":
        return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir;
      case "status":
        return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir;
      case "title":
        return a.title.localeCompare(b.title, "fr") * dir;
      case "project":
        return a.projectName.localeCompare(b.projectName, "fr") * dir;
    }
  };
  // Critère secondaire stable : priorité puis titre.
  return [...tasks].sort((a, b) => cmp(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title, "fr"));
}

const select =
  "h-8 rounded-lg border border-border bg-surface pr-7 pl-2.5 text-sm focus:border-accent focus:outline-none";

/** Barre de filtres commune aux vues Kanban et Liste. */
export function FilterBar({
  filters,
  onChange,
  showProject,
  showStatus,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  showProject?: boolean;
  showStatus?: boolean;
}) {
  const { team, projects } = useApp();
  const set = <K extends keyof TaskFilters>(k: K, v: TaskFilters[K]) => onChange({ ...filters, [k]: v });
  const active = Object.entries(filters).some(([k, v]) => v !== DEFAULT_FILTERS[k as keyof TaskFilters]);
  // Nombre de filtres "avancés" actifs (affiché sur le bouton mobile).
  const advanced = (["assignee", "priority", "due", "status", "project"] as const).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length;
  // Sur mobile, les listes déroulantes sont repliées derrière un bouton "Filtres".
  const [expanded, setExpanded] = useState(false);

  // Saisie gardée localement : l'adresse, source des filtres, n'est mise à jour qu'après coup.
  // Sans cela, une frappe rapide pourrait être écrasée par une valeur de l'adresse en retard.
  const [text, setText] = useState(filters.q);
  const sentText = useRef(filters.q);
  useEffect(() => {
    // Changement venu d'ailleurs (réinitialisation, autre onglet) : on l'affiche.
    if (filters.q !== sentText.current) {
      sentText.current = filters.q;
      setText(filters.q);
    }
  }, [filters.q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            sentText.current = e.target.value;
            set("q", e.target.value);
          }}
          placeholder="Filtrer…"
          aria-label="Filtrer par texte"
          className="h-8 w-full rounded-lg border border-border bg-surface pr-2 pl-8 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Filtre en un clic le plus utilisé */}
      <button
        onClick={() => set("assignee", filters.assignee === "me" ? "all" : "me")}
        className={cn(
          "h-8 rounded-lg border px-3 text-sm",
          filters.assignee === "me" ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface hover:bg-surface-2",
        )}
      >
        Mes tâches
      </button>

      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm sm:hidden"
      >
        <SlidersHorizontal size={14} /> Filtres{advanced > 0 && <span className="text-accent">({advanced})</span>}
      </button>

      <div className={cn("w-full flex-wrap items-center gap-2 sm:flex sm:w-auto", expanded ? "flex" : "hidden")}>
      <select aria-label="Responsable" className={select} value={filters.assignee} onChange={(e) => set("assignee", e.target.value)}>
        <option value="all">Tous les responsables</option>
        <option value="me">Moi</option>
        <option value="none">Non assignées</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select aria-label="Priorité" className={select} value={filters.priority} onChange={(e) => set("priority", e.target.value as TaskFilters["priority"])}>
        <option value="all">Toutes priorités</option>
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select aria-label="Échéance" className={select} value={filters.due} onChange={(e) => set("due", e.target.value as DueFilter)}>
        <option value="all">Toutes échéances</option>
        <option value="overdue">En retard</option>
        <option value="today">Aujourd&apos;hui</option>
        <option value="week">Cette semaine</option>
        <option value="none">Sans échéance</option>
      </select>

      {showStatus && (
        <select aria-label="Statut" className={select} value={filters.status} onChange={(e) => set("status", e.target.value as TaskFilters["status"])}>
          <option value="all">Tous statuts</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      )}

      {showProject && (
        <select aria-label="Projet" className={select} value={filters.project} onChange={(e) => set("project", e.target.value)}>
          <option value="all">Tous les projets</option>
          {projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      )}

      </div>

      {active && (
        <button onClick={() => onChange(DEFAULT_FILTERS)} className="flex h-8 items-center gap-1 px-2 text-sm text-muted hover:text-text">
          <X size={14} /> Réinitialiser
        </button>
      )}
    </div>
  );
}
