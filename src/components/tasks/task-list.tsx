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
import { ArrowDown, ArrowUp, Check, ChevronRight, CornerLeftUp, GripVertical, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createTask, moveTask, setTaskParent } from "@/actions/tasks";
import type { TaskStatus } from "@/db/schema";
import { useApp } from "@/components/layout/app-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { DueBadge, PriorityBadge, StatusBadge } from "@/components/ui/badges";
import { Spinner } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/misc";
import type { TaskView } from "@/lib/queries";
import {
  canHaveSubtasks,
  guideSegments,
  nestingError,
  nestSubtasks,
  subtreeEnd,
  taskRootColor,
  taskTree,
  withAncestors,
  type GuideSegment,
  type TreeRow,
} from "@/lib/task-links";
import { cn, percent } from "@/lib/utils";
import { sortTasks, type Sort, type SortKey } from "./filters";
import { ParentLabel, TaskLinkBadges } from "./task-links";
import { useCollapsedTasks } from "./use-collapsed-tasks";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: "in_progress", in_progress: "done", done: "todo" };

/**
 * Hook : changement de statut instantané à l'écran, enregistré en arrière-plan.
 * Quand une sous-tâche est terminée et que c'étaient les dernières de sa parente, un toast
 * propose de terminer la parente (sans jamais le faire automatiquement).
 */
export function useOptimisticStatus(tasks: TaskView[]) {
  const { toast } = useApp();
  const [overrides, setOverrides] = useState<Record<string, TaskStatus>>({});
  // Les données serveur font foi dès qu'elles arrivent.
  useEffect(() => setOverrides({}), [tasks]);

  const withStatus = tasks.map((t) => (overrides[t.id] ? { ...t, status: overrides[t.id] } : t));

  /** Parente dont toutes les sous-tâches seront terminées une fois `task` terminée, s'il y en a une à proposer. */
  const parentToFinish = (task: TaskView): TaskView | null => {
    const parent = task.parentId ? withStatus.find((t) => t.id === task.parentId) : undefined;
    if (!parent || parent.status === "done" || task.status === "done") return null;
    const siblings = withStatus.filter((t) => t.parentId === parent.id);
    // Liste complète (vue liste) : on regarde les sœurs affichées, à jour de leurs changements
    // non encore confirmés. Liste partielle (tableau de bord) : on se fie au décompte du serveur.
    const allDone =
      siblings.length === parent.subtasks.total
        ? siblings.every((s) => s.id === task.id || s.status === "done")
        : parent.subtasks.done + 1 >= parent.subtasks.total;
    return allDone ? parent : null;
  };

  const setStatus = (task: TaskView, status: TaskStatus) => {
    const parent = status === "done" ? parentToFinish(task) : null;
    setOverrides((o) => ({ ...o, [task.id]: status }));
    moveTask(task.id, status).then((res) => {
      if (!res.ok) {
        toast(res.error, "error");
        setOverrides((o) => {
          const { [task.id]: _, ...rest } = o;
          return rest;
        });
        return;
      }
      if (parent) {
        toast(`Toutes les sous-tâches de « ${parent.title} » sont terminées.`, "success", {
          label: "Terminer la tâche",
          onClick: () => setStatus(parent, "done"),
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

/** Retrait par niveau de l'arbre, et marge gauche des lignes (px-4) : servent à placer les lignes guides. */
const INDENT = 22;
const ROW_PADDING = 16;
/** Demi-largeur du chevron : les lignes guides passent sous le chevron de la tâche parente. */
const GUIDE_OFFSET = 8;

/** Cible de dépôt qui transforme une sous-tâche en tâche principale. */
const DETACH_ID = "__detach__";

/** Ligne visée : celle sous le pointeur, ou la plus proche au clavier. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

type ParentOverride = Pick<TaskView, "parentId" | "parentTitle">;

/** Tri de la liste : null = ordre du projet (ordre des tâches sœurs dans l'arbre). */
type ListSort = Sort | null;

/**
 * Vue liste en arbre : chaque tâche racine forme un bloc (une « catégorie ») avec ses sous-tâches,
 * en retrait sur plusieurs niveaux, reliées par des lignes guides à la couleur de la racine.
 * Un clic sur une ligne ouvre la tâche ; un clic sur le statut le fait avancer.
 * Le tri s'applique entre tâches sœurs. Glisser une ligne sur une autre en fait une sous-tâche ;
 * la glisser sur le bandeau du haut la détache.
 *
 * `tasks` : tâches retenues par les filtres ; `allTasks` : toutes les tâches, pour afficher
 * (grisés) les ancêtres d'une sous-tâche trouvée et vérifier les règles de l'arbre.
 *
 * TODO(arbre des tâches) : réordonner les tâches sœurs et déplacer une branche par
 * glisser-déposer (le déposer-sur-une-ligne actuel ne fait que changer de parente, en fin de liste).
 */
export function TaskList({ tasks, allTasks = tasks, showProject = true }: { tasks: TaskView[]; allTasks?: TaskView[]; showProject?: boolean }) {
  const { me, toast } = useApp();
  const [sort, setSort] = useState<ListSort>(null);
  const [withStatus, setStatus] = useOptimisticStatus(allTasks);
  // Rattachements faits par glisser-déposer, affichés avant la réponse du serveur.
  const [parents, setParents] = useState<Record<string, ParentOverride>>({});
  useEffect(() => setParents({}), [allTasks]);
  const { collapsed, toggle, expand } = useCollapsedTasks(me.id);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const all = useMemo(() => withStatus.map((t) => (parents[t.id] ? { ...t, ...parents[t.id] } : t)), [withStatus, parents]);
  const tree = useMemo(() => taskTree(all), [all]);
  const { rows, contextIds } = useMemo(() => {
    const byId = new Map(all.map((t) => [t.id, t]));
    const matching = tasks.map((t) => byId.get(t.id) ?? t);
    const { tasks: shown, contextIds } = withAncestors(matching, all);
    const ordered = sort ? sortTasks(shown, sort) : [...shown].sort((a, b) => a.siblingPosition - b.siblingPosition);
    return { rows: nestSubtasks(ordered, collapsed), contextIds };
  }, [tasks, all, sort, collapsed]);

  // Tâches racines successives : chacune ouvre un nouveau bloc.
  const blocks = useMemo(() => {
    const result: TreeRow<TaskView>[][] = [];
    for (const row of rows) {
      if (row.depth === 0) result.push([row]);
      else result.at(-1)?.push(row);
    }
    return result;
  }, [rows]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? all.find((t) => t.id === activeId) : undefined;
  // Voir kanban-board.tsx : useId évite une erreur d'hydratation sur les attributs aria de dnd-kit.
  const dndId = useId();
  const sensors = useSensors(
    // Petit seuil : un simple clic ouvre la tâche, un déplacement la fait glisser.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  /** Pourquoi `child` ne peut pas être déposée sur `target`, ou null. */
  const dropError = (child: TaskView, target: TaskView) =>
    child.parentId === target.id ? "C'est déjà une sous-tâche de cette tâche." : nestingError(all, child, target.id);

  function onDragEnd({ over }: DragEndEvent) {
    setActiveId(null);
    if (!over || !active) return;
    let parent: TaskView | null = null;
    if (over.id === DETACH_ID) {
      if (!active.parentId) return;
    } else {
      const target = all.find((t) => t.id === over.id);
      if (!target || target.id === active.id) return;
      const error = dropError(active, target);
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

  // Tri croissant, puis décroissant, puis retour à l'ordre du projet.
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const startAdding = (id: string) => {
    expand(id);
    setAddingTo(id);
  };

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
        {/* Même retrait que les blocs (px-2 + bordure) : les colonnes restent alignées. */}
        <div className="border-b border-border bg-surface-2/50 px-2">
          <div className={cn(grid, "border-x border-transparent px-4 py-2 text-xs font-medium text-muted")}>
            {cols.map((c) =>
              c.key ? (
                <button
                  key={c.label}
                  onClick={() => toggleSort(c.key!)}
                  title={sort?.key === c.key && sort.dir === "desc" ? "Revenir à l'ordre du projet" : undefined}
                  className={cn("flex items-center gap-1 text-left whitespace-nowrap hover:text-text", c.className, sort?.key === c.key && "text-text")}
                >
                  {c.label}
                  {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </button>
              ) : (
                <span key={c.label} className={c.className}>
                  {c.label}
                </span>
              ),
            )}
            <span className="sm:hidden" />
          </div>
        </div>

        {active?.parentId && <DetachZone />}

        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Aucune tâche ne correspond aux filtres.</p>}

        <div className="space-y-2 p-2 empty:hidden">
          {blocks.map((block) => {
            const rootColor = taskRootColor(block[0].task.id);
            return (
              <ul key={block[0].task.id} className="overflow-hidden rounded-lg border border-border">
                {withInlineInput(block, addingTo).map((entry, i, entries) => {
                  const guides = guideSegments(entries.map((e) => e.depth), i);
                  if (entry.kind === "input") {
                    return <InlineSubtask key="nouvelle" parent={entry.parent} depth={entry.depth} rootColor={rootColor} guides={guides} onClose={() => setAddingTo(null)} />;
                  }
                  const { row } = entry;
                  const depth = tree.depth(row.task.id);
                  return (
                    <TreeItem
                      key={row.task.id}
                      row={row}
                      rootColor={rootColor}
                      grid={grid}
                      showProject={showProject}
                      setStatus={setStatus}
                      context={contextIds.has(row.task.id)}
                      collapsed={collapsed.has(row.task.id)}
                      onToggle={() => toggle(row.task.id)}
                      onAddSubtask={canHaveSubtasks(depth) ? () => startAdding(row.task.id) : undefined}
                      dropAllowed={!!active && active.id !== row.task.id && !dropError(active, row.task)}
                      guides={guides}
                    />
                  );
                })}
              </ul>
            );
          })}
        </div>
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

type BlockEntry = { kind: "task"; row: TreeRow<TaskView>; depth: number } | { kind: "input"; parent: TaskView; depth: number };

/** Lignes d'un bloc, avec le champ de saisie d'une sous-tâche après la dernière ligne du sous-arbre de sa parente. */
function withInlineInput(block: TreeRow<TaskView>[], parentId: string | null): BlockEntry[] {
  const entries: BlockEntry[] = block.map((row) => ({ kind: "task", row, depth: row.depth }));
  const start = parentId ? block.findIndex((r) => r.task.id === parentId) : -1;
  if (start >= 0) {
    const end = subtreeEnd(block.map((r) => r.depth), start);
    entries.splice(end + 1, 0, { kind: "input", parent: block[start].task, depth: block[start].depth + 1 });
  }
  return entries;
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

/** Style d'une ligne de niveau `depth` : fond du niveau (le 4e et au-delà reprennent le dernier). */
const levelStyle = (depth: number): CSSProperties => ({ "--row-bg": `var(--task-level-${Math.min(depth, 3)})` }) as CSSProperties;

/**
 * Lignes guides verticales d'une ligne : une par ancêtre, sous son chevron, plus un petit trait
 * horizontal vers la ligne. Les lignes voisines se prolongent, ce qui dessine l'arbre comme dans
 * un explorateur de fichiers, à la couleur (atténuée) de la tâche racine.
 */
function Guides({ segments, color }: { segments: GuideSegment[]; color: string }) {
  if (segments.length === 0) return null;
  const line = `color-mix(in srgb, ${color} 50%, transparent)`;
  const x = (level: number) => ROW_PADDING + level * INDENT + GUIDE_OFFSET - 1;
  const last = segments.length - 1;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0">
      {segments.map((segment, level) =>
        segment === "none" ? null : (
          <span key={level} className={cn("absolute top-0 w-0.5", segment === "end" ? "h-1/2" : "-bottom-px")} style={{ left: x(level), background: line }} />
        ),
      )}
      <span className="absolute top-1/2 h-0.5" style={{ left: x(last), width: INDENT - GUIDE_OFFSET, background: line }} />
    </span>
  );
}

function TreeItem({
  row: { task: t, depth, hasChildren },
  rootColor,
  grid,
  showProject,
  setStatus,
  context,
  collapsed,
  onToggle,
  onAddSubtask,
  dropAllowed,
  guides,
}: {
  row: TreeRow<TaskView>;
  rootColor: string;
  grid: string;
  showProject: boolean;
  setStatus: (task: TaskView, status: TaskStatus) => void;
  /** Ancêtre affiché seulement pour situer une sous-tâche trouvée par les filtres. */
  context: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** Absent au niveau maximal : la tâche ne peut plus avoir de sous-tâches. */
  onAddSubtask?: () => void;
  /** Vrai si la tâche en cours de glisser peut devenir sous-tâche de celle-ci. */
  dropAllowed: boolean;
  /** Tracé des lignes guides de chaque niveau (voir guideSegments). */
  guides: GuideSegment[];
}) {
  const { membersById, today, editTask } = useApp();
  const drag = useDraggable({ id: t.id });
  const drop = useDroppable({ id: t.id });
  const assignees = t.assigneeIds.map((id) => membersById.get(id)).filter((m) => !!m);
  const done = t.status === "done";
  const open = () => editTask(t);
  const highlighted = drop.isOver && dropAllowed;
  const root = depth === 0;
  const { total, done: doneCount } = t.subtasks;

  function onKeyDown(e: KeyboardEvent<HTMLLIElement>) {
    // Touches pressées sur un bouton de la ligne : comportement normal du bouton.
    if (e.target !== e.currentTarget) return;
    // Entrée ouvre la tâche ; Espace reste réservé au glisser-déposer au clavier.
    if (e.key === "Enter") open();
    else drag.listeners?.onKeyDown?.(e);
  }

  return (
    <li
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.attributes}
      {...drag.listeners}
      onClick={open}
      onKeyDown={onKeyDown}
      style={{
        ...(highlighted ? ({ "--row-bg": "var(--accent-soft)" } as CSSProperties) : levelStyle(depth)),
        // Bordure gauche de la tâche racine, à sa couleur (ombre intérieure : n'affecte pas le retrait).
        ...(root && { boxShadow: `inset 4px 0 0 ${rootColor}` }),
      }}
      className={cn(
        grid,
        "task-tree-row relative cursor-pointer touch-manipulation border-b border-border/70 px-4 last:border-b-0",
        "bg-(--row-bg) hover:bg-[color-mix(in_srgb,var(--row-bg)_96%,var(--text))]",
        root ? "py-3" : "py-2",
        drag.isDragging ? "opacity-40" : context && "opacity-60",
        highlighted && "ring-2 ring-accent ring-inset",
      )}
    >
      <Guides segments={guides} color={rootColor} />
      <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * INDENT }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Déplier" : "Replier"} les sous-tâches de « ${t.title} »`}
            className="-mx-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
          >
            <ChevronRight size={14} className={cn("transition-transform", !collapsed && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <DoneCheckbox task={t} onToggle={() => setStatus(t, done ? "todo" : "done")} />
        <div className="min-w-0 flex-1">
          {/* Parente absente de la liste (cas limite) : on la rappelle au-dessus du titre. */}
          {root && <ParentLabel task={t} />}
          <div className="flex min-w-0 items-center gap-2.5">
            <p className={cn("truncate", root ? "text-[15px] font-semibold" : "text-sm", done && "text-muted line-through")}>
              {t.title}
              {context && <span className="sr-only"> (affichée pour situer ses sous-tâches)</span>}
            </p>
            <TaskLinkBadges task={t} />
          </div>
          {total > 0 && (
            <div className="mt-1 w-24">
              <ProgressBar value={percent(doneCount, total)} color={rootColor} className="h-1" label={`Sous-tâches terminées : ${doneCount} sur ${total}`} />
            </div>
          )}
          {highlighted && <p className="text-xs font-medium text-accent">Déposer pour en faire une sous-tâche</p>}
          {/* Infos condensées sur mobile */}
          <div className="mt-0.5 flex items-center gap-2.5 sm:hidden">
            <PriorityBadge priority={t.priority} compact />
            <DueBadge dueDate={t.dueDate} today={today} done={done} />
            {showProject && <span className="truncate text-xs text-muted">{t.projectName}</span>}
          </div>
        </div>
        {onAddSubtask && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddSubtask();
            }}
            aria-label={`Ajouter une sous-tâche à « ${t.title} »`}
            className="reveal-on-hover flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted transition-opacity hover:bg-surface-2 hover:text-text"
          >
            <Plus size={13} /> <span className="hidden sm:inline">Sous-tâche</span>
          </button>
        )}
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

/**
 * Saisie d'une sous-tâche directement dans l'arbre : Entrée crée la sous-tâche et garde le champ
 * ouvert pour la suivante ; Échap (ou quitter un champ vide) ferme.
 */
function InlineSubtask({
  parent,
  depth,
  rootColor,
  guides,
  onClose,
}: {
  parent: TaskView;
  depth: number;
  rootColor: string;
  guides: GuideSegment[];
  onClose: () => void;
}) {
  const { toast } = useApp();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const value = title.trim();
    if (!value || saving) return;
    setSaving(true);
    const res = await createTask({ projectId: parent.projectId, parentId: parent.id, title: value });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    setTitle("");
  }

  return (
    <li style={levelStyle(depth)} className="task-tree-row relative border-b border-border/70 bg-(--row-bg) px-4 py-2 last:border-b-0">
      <Guides segments={guides} color={rootColor} />
      <div className="flex items-center gap-2" style={{ paddingLeft: depth * INDENT }}>
        <span className="w-4 shrink-0" />
        {saving ? <Spinner size={16} className="shrink-0 text-muted" /> : <Plus size={16} className="shrink-0 text-muted" aria-hidden />}
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          onBlur={() => !title.trim() && !saving && onClose()}
          maxLength={200}
          placeholder={`Nouvelle sous-tâche de « ${parent.title} » (Entrée pour ajouter, Échap pour fermer)`}
          aria-label={`Titre de la nouvelle sous-tâche de « ${parent.title} »`}
          className="h-8 max-w-xl bg-surface"
        />
      </div>
    </li>
  );
}
