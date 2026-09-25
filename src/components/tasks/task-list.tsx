"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowUp, Check, CornerLeftUp, GripVertical } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { moveTask, setTaskParent } from "@/actions/tasks";
import type { TaskStatus } from "@/db/schema";
import { useApp } from "@/components/layout/app-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { DueBadge, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import type { TaskView } from "@/lib/queries";
import { nestingError, nestSubtasks } from "@/lib/task-links";
import { cn } from "@/lib/utils";
import { sortTasks, type Sort, type SortKey } from "./filters";
import { ParentLabel, TaskLinkBadges } from "./task-links";

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

/** Cible de dépôt qui transforme une sous-tâche en tâche principale. */
const DETACH_ID = "__detach__";

/** Ligne visée : celle sous le pointeur, ou la plus proche au clavier. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

type ParentOverride = Pick<TaskView, "parentId" | "parentTitle">;

/**
 * Vue liste triable. Un clic sur une ligne ouvre la tâche ; un clic sur le statut le fait avancer.
 * Les sous-tâches sont rangées en retrait sous leur parente. Glisser une ligne sur une autre en
 * fait une sous-tâche ; la glisser sur le bandeau du haut la détache.
 */
export function TaskList({ tasks, showProject = true }: { tasks: TaskView[]; showProject?: boolean }) {
  const { toast } = useApp();
  const [sort, setSort] = useState<Sort>({ key: "dueDate", dir: "asc" });
  const [withStatus, setStatus] = useOptimisticStatus(tasks);
  // Rattachements faits par glisser-déposer, affichés avant la réponse du serveur.
  const [parents, setParents] = useState<Record<string, ParentOverride>>({});
  useEffect(() => setParents({}), [tasks]);
  const items = withStatus.map((t) => (parents[t.id] ? { ...t, ...parents[t.id] } : t));
  const rows = nestSubtasks(sortTasks(items, sort));

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? items.find((t) => t.id === activeId) : undefined;
  // Voir kanban-board.tsx : useId évite une erreur d'hydratation sur les attributs aria de dnd-kit.
  const dndId = useId();
  const sensors = useSensors(
    // Petit seuil : un simple clic ouvre la tâche, un déplacement la fait glisser.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd({ over }: DragEndEvent) {
    setActiveId(null);
    if (!over || !active) return;
    let parent: TaskView | null = null;
    if (over.id === DETACH_ID) {
      if (!active.parentId) return;
    } else {
      const target = items.find((t) => t.id === over.id);
      if (!target || target.id === active.id) return;
      const error = nestingError(active, target);
      if (error) return toast(error, "error");
      parent = target;
    }

    const child = active;
    setParents((p) => ({ ...p, [child.id]: { parentId: parent?.id ?? null, parentTitle: parent?.title ?? null } }));
    setTaskParent(child.id, parent?.id ?? null).then((res) => {
      if (res.ok) {
        toast(parent ? `« ${child.title} » est maintenant une sous-tâche de « ${parent.title} ».` : `« ${child.title} » n'est plus une sous-tâche.`);
        return;
      }
      toast(res.error, "error");
      setParents((p) => {
        const { [child.id]: _, ...rest } = p;
        return rest;
      });
    });
  }

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const cols = showProject ? COLUMNS : COLUMNS.filter((c) => c.key !== "project");
  const grid = showProject ? GRID : GRID.replace("lg:grid-cols-[1fr_160px_110px_90px_110px_110px]", "");

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
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

        {active?.parentId && <DetachZone />}

        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Aucune tâche ne correspond aux filtres.</p>}

        <ul>
          {rows.map(({ task, depth }) => (
            <TaskRow
              key={task.id}
              task={task}
              depth={depth}
              grid={grid}
              showProject={showProject}
              setStatus={setStatus}
              dropAllowed={!!active && !nestingError(active, task)}
            />
          ))}
        </ul>
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="flex max-w-xs items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-xl">
            <GripVertical size={14} className="shrink-0 text-muted" />
            <span className="truncate">{active.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** Bandeau affiché pendant qu'on glisse une sous-tâche : y déposer la détache de sa parente. */
function DetachZone() {
  const { setNodeRef, isOver } = useDroppable({ id: DETACH_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "m-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted transition-colors",
        isOver && "border-accent bg-accent-soft text-accent",
      )}
    >
      <CornerLeftUp size={14} /> Déposer ici pour en faire une tâche principale
    </div>
  );
}

function TaskRow({
  task: t,
  depth,
  grid,
  showProject,
  setStatus,
  dropAllowed,
}: {
  task: TaskView;
  depth: 0 | 1;
  grid: string;
  showProject: boolean;
  setStatus: (task: TaskView, status: TaskStatus) => void;
  /** Vrai si la tâche en cours de glisser peut devenir sous-tâche de celle-ci. */
  dropAllowed: boolean;
}) {
  const { membersById, today, editTask } = useApp();
  const drag = useDraggable({ id: t.id });
  const drop = useDroppable({ id: t.id });
  const assignees = t.assigneeIds.map((id) => membersById.get(id)).filter((m) => !!m);
  const done = t.status === "done";
  const open = () => editTask(t);
  const highlighted = drop.isOver && dropAllowed;

  return (
    <li
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={open}
      onKeyDown={(e) => {
        // Entrée ouvre la tâche ; Espace reste réservé au glisser-déposer au clavier.
        if (e.key === "Enter") open();
        else drag.listeners?.onKeyDown?.(e);
      }}
      className={cn(
        grid,
        "cursor-pointer touch-manipulation border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2/60",
        drag.isDragging && "opacity-40",
        highlighted && "bg-accent-soft/70 ring-2 ring-accent ring-inset hover:bg-accent-soft/70",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-3", depth === 1 && "ml-2 border-l-2 border-border pl-4")}>
        <DoneCheckbox task={t} onToggle={() => setStatus(t, done ? "todo" : "done")} />
        <div className="min-w-0">
          {/* Sous sa parente, affichée juste au-dessus, le rappel serait redondant. */}
          {depth === 0 && <ParentLabel task={t} />}
          <div className="flex min-w-0 items-center gap-2.5">
            <p className={cn("truncate text-sm", done && "text-muted line-through")}>{t.title}</p>
            <TaskLinkBadges task={t} />
          </div>
          {highlighted && <p className="text-xs font-medium text-accent">Déposer pour en faire une sous-tâche</p>}
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
}
