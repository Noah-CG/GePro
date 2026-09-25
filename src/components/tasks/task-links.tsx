"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, CornerDownRight, ListTree, Lock, Plus, X } from "lucide-react";
import { useState } from "react";
import type { TaskOption } from "@/actions/tasks";
import { StatusIcon } from "@/components/ui/badges";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Sélection multiple des tâches prérequises : pastilles retirables + liste filtrable.
 * `options` : tâches du projet, sans la tâche éditée.
 */
export function DependencyPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: TaskOption[];
}) {
  const [query, setQuery] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => o.title.toLowerCase().includes(q)) : options;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((id) => {
        const o = byId.get(id);
        if (!o) return null;
        return (
          <span key={id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2 text-xs">
            <StatusIcon status={o.status} size={12} />
            <span className={cn("truncate", o.status === "done" && "text-muted line-through")}>{o.title}</span>
            <button type="button" onClick={() => toggle(id)} className="rounded-full p-0.5 text-muted hover:text-text" aria-label={`Retirer ${o.title}`}>
              <X size={12} />
            </button>
          </span>
        );
      })}

      <Popover.Root onOpenChange={(open) => !open && setQuery("")}>
        <Popover.Trigger
          disabled={options.length === 0}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus size={12} /> {value.length ? "Ajouter" : "Ajouter une dépendance"}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} className="z-[70] w-72 rounded-xl border border-border bg-surface p-1 shadow-xl">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une tâche…"
              aria-label="Rechercher une tâche"
              className="mb-1 h-8 w-full rounded-lg bg-surface-2 px-2.5 text-sm outline-none placeholder:text-muted"
            />
            <div className="max-h-64 overflow-y-auto">
              {visible.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted">Aucune tâche</p>}
              {visible.map((o) => {
                const selected = value.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(o.id)}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2", selected && "font-medium")}
                  >
                    <StatusIcon status={o.status} size={14} />
                    <span className={cn("flex-1 truncate", o.parentId && "text-muted")}>{o.title}</span>
                    {selected && <Check size={14} className="text-accent" />}
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** Rappel de la tâche parente, au-dessus du titre d'une sous-tâche. */
export function ParentLabel({ task, className }: { task: TaskView; className?: string }) {
  if (!task.parentTitle) return null;
  return (
    <span className={cn("flex min-w-0 items-center gap-1 text-xs text-muted", className)} title={`Sous-tâche de « ${task.parentTitle} »`}>
      <CornerDownRight size={11} className="shrink-0" />
      <span className="truncate">{task.parentTitle}</span>
    </span>
  );
}

/** Indicateurs compacts : tâche bloquée par des prérequis, avancement des sous-tâches. */
export function TaskLinkBadges({ task }: { task: TaskView }) {
  const blocked = task.blockers.length > 0 && task.status !== "done";
  const { total, done } = task.subtasks;
  if (!blocked && total === 0) return null;
  return (
    <>
      {blocked && (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-warning"
          title={`En attente de : ${task.blockers.map((b) => b.title).join(", ")}`}
        >
          <Lock size={12} /> Bloquée
        </span>
      )}
      {total > 0 && (
        <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", done === total ? "text-success" : "text-muted")} title="Sous-tâches terminées">
          <ListTree size={12} /> {done}/{total}
        </span>
      )}
    </>
  );
}
