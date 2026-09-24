"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useEffect, useId, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { createTask, moveTask } from "@/actions/tasks";
import type { TaskStatus } from "@/db/schema";
import { useApp } from "@/components/layout/app-provider";
import { StatusIcon } from "@/components/ui/badges";
import { STATUSES } from "@/lib/constants";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";

type Columns = Record<TaskStatus, string[]>;

/** Répartit les tâches par statut, triées par position. */
function toColumns(tasks: TaskView[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], done: [] };
  for (const t of [...tasks].sort((a, b) => a.position - b.position)) cols[t.status].push(t.id);
  return cols;
}

/** Position flottante entre les deux voisines de la carte déposée. */
function positionBetween(prev?: number, next?: number): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1024;
  if (next !== undefined) return next - 1024;
  return 1024;
}

/**
 * Tableau Kanban avec glisser-déposer (souris, tactile et clavier).
 * Les changements sont appliqués immédiatement à l'écran puis enregistrés en arrière-plan.
 */
export function KanbanBoard({ tasks, projectId, showProject }: { tasks: TaskView[]; projectId?: string; showProject?: boolean }) {
  const { editTask, newTask, toast } = useApp();
  const [byId, setById] = useState(() => new Map(tasks.map((t) => [t.id, t])));
  const [columns, setColumns] = useState<Columns>(() => toColumns(tasks));
  const [activeId, setActiveId] = useState<string | null>(null);
  // Sans id, dnd-kit numérote ses attributs aria avec un compteur global qui diffère entre
  // le serveur et le navigateur (erreur d'hydratation) ; useId est identique des deux côtés.
  const dndId = useId();

  // Resynchronise quand les données serveur changent (hors glisser en cours).
  useEffect(() => {
    if (activeId) return;
    setById(new Map(tasks.map((t) => [t.id, t])));
    setColumns(toColumns(tasks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const sensors = useSensors(
    // Petit seuil : un simple clic ouvre la tâche, un déplacement la fait glisser.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string): TaskStatus | undefined =>
    (Object.keys(columns) as TaskStatus[]).find((s) => s === id || columns[s].includes(id));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  // Passage d'une colonne à l'autre pendant le glisser.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const target = cols[to];
      const overIndex = target.indexOf(String(over.id));
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...cols,
        [from]: cols[from].filter((id) => id !== active.id),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const id = String(active.id);
    const status = findColumn(id);
    const original = byId.get(id);
    if (!over || !status || !original) return;

    // Réordonnancement dans la colonne d'arrivée.
    let column = columns[status];
    const oldIndex = column.indexOf(id);
    const overIndex = column.indexOf(String(over.id));
    if (overIndex >= 0 && overIndex !== oldIndex) column = arrayMove(column, oldIndex, overIndex);
    const index = column.indexOf(id);

    const position = positionBetween(byId.get(column[index - 1])?.position, byId.get(column[index + 1])?.position);
    if (status === original.status && column === columns[status]) return; // aucun mouvement réel

    setColumns((cols) => ({ ...cols, [status]: column }));
    setById((m) => new Map(m).set(id, { ...original, status, position }));

    moveTask(id, status, position).then((res) => {
      if (!res.ok) {
        toast(res.error, "error");
        setColumns(toColumns(tasks));
      } else if (status !== original.status && status === "done") {
        toast("Tâche terminée 🎉");
      }
    });
  }

  const activeTask = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setColumns(toColumns(tasks));
      }}
    >
      {/* Sur mobile : colonnes en défilement horizontal avec aimantation. */}
      <div className="scroll-thin -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
        {STATUSES.map(({ value, label }) => (
          <Column key={value} status={value} label={label} count={columns[value].length} onAdd={() => newTask({ status: value, projectId })} projectId={projectId}>
            <SortableContext items={columns[value]} strategy={verticalListSortingStrategy}>
              {columns[value].map((id) => {
                const task = byId.get(id);
                return task ? <SortableCard key={id} task={task} showProject={showProject} onOpen={() => editTask(task)} /> : null;
              })}
            </SortableContext>
          </Column>
        ))}
      </div>
      <DragOverlay>{activeTask && <TaskCard task={activeTask} showProject={showProject} dragging />}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  label,
  count,
  children,
  onAdd,
  projectId,
}: {
  status: TaskStatus;
  label: string;
  count: number;
  children: ReactNode;
  onAdd: () => void;
  projectId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[82vw] shrink-0 snap-center flex-col rounded-2xl bg-surface-2/60 p-2 transition-colors sm:w-auto",
        isOver && "bg-accent-soft/60",
      )}
      aria-label={label}
    >
      <header className="flex items-center gap-2 px-2 py-1.5">
        <StatusIcon status={status} size={15} />
        <h2 className="text-sm font-medium">{label}</h2>
        <span className="text-xs text-muted">{count}</span>
        <button onClick={onAdd} className="ml-auto rounded-md p-1 text-muted hover:bg-surface hover:text-text" aria-label={`Ajouter une tâche « ${label} »`}>
          <Plus size={15} />
        </button>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 p-1">{children}</div>
      {projectId && <QuickAdd projectId={projectId} status={status} />}
    </section>
  );
}

function SortableCard({ task, showProject, onOpen }: { task: TaskView; showProject?: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("cursor-grab touch-manipulation active:cursor-grabbing", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Entrée ouvre la tâche ; Espace reste réservé au glisser-déposer au clavier.
        if (e.key === "Enter") onOpen();
        else listeners?.onKeyDown?.(e);
      }}
    >
      <TaskCard task={task} showProject={showProject} />
    </div>
  );
}

/** Ajout express : on tape un titre, Entrée, c'est créé dans la colonne. */
function QuickAdd({ projectId, status }: { projectId: string; status: TaskStatus }) {
  const { toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const value = title.trim();
    if (!value) return setEditing(false);
    startTransition(async () => {
      const res = await createTask({ projectId, title: value, status });
      if (!res.ok) return toast(res.error, "error");
      setTitle("");
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") {
      setTitle("");
      setEditing(false);
    }
  };

  return editing ? (
    <input
      autoFocus
      value={title}
      disabled={pending}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => !title.trim() && setEditing(false)}
      placeholder="Titre puis Entrée…"
      className="m-1 h-9 rounded-lg border border-accent bg-surface px-3 text-sm outline-none"
    />
  ) : (
    <button onClick={() => setEditing(true)} className="m-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-surface hover:text-text">
      <Plus size={14} /> Ajouter
    </button>
  );
}
