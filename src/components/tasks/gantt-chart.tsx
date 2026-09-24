"use client";

import { AlertCircle, CalendarPlus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { setTaskDates } from "@/actions/tasks";
import { useApp } from "@/components/layout/app-provider";
import { AvatarStack } from "@/components/ui/avatar";
import { PRIORITY_DOT, StatusIcon } from "@/components/ui/badges";
import { addDays, formatMonthYear, formatShort, formatWeekdayShort } from "@/lib/dates";
import { barBox, GANTT_ZOOMS, ganttMonths, ganttRange, planTasks, shiftSpan, spanDays, type DragMode, type GanttZoom, type Span } from "@/lib/gantt";
import type { TaskView } from "@/lib/queries";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 40;
/** En dessous de cette largeur, le titre s'affiche à droite de la barre plutôt que dedans. */
const LABEL_INSIDE_MIN = 90;
/** Déplacement minimal (px) pour qu'un appui sur une barre devienne un glissement et non un clic. */
const DRAG_THRESHOLD = 4;
/** Délai avant d'enregistrer les déplacements au clavier (plusieurs flèches = un seul envoi). */
const KEYBOARD_SAVE_DELAY = 600;

type Drag = { taskId: string; mode: DragMode; span: Span; originX: number; days: number; moved: boolean };

/**
 * Diagramme de Gantt : une ligne par tâche, une barre de son début à son échéance.
 *
 * - Glisser une barre la déplace ; tirer sur un de ses bords change le début ou l'échéance.
 * - Au clavier, sur une barre : ← / → déplacent la tâche d'un jour, Maj + ← / → changent son
 *   échéance, Entrée l'ouvre.
 * - Les changements s'affichent aussitôt et sont enregistrés en arrière-plan (retour en arrière
 *   en cas d'erreur), comme dans le Kanban.
 */
export function GanttChart({ tasks, showProject }: { tasks: TaskView[]; showProject?: boolean }) {
  const { membersById, today, editTask, toast } = useApp();
  const [zoom, setZoom] = useState<GanttZoom>("semaine");
  const dayWidth = GANTT_ZOOMS[zoom].dayWidth;

  // Dates modifiées à l'écran, en attente de la réponse du serveur.
  const [overrides, setOverrides] = useState<Record<string, Span>>({});
  useEffect(() => setOverrides({}), [tasks]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const withDates = useMemo(
    () => tasks.map((t) => (overrides[t.id] ? { ...t, startDate: overrides[t.id].start, dueDate: overrides[t.id].end } : t)),
    [tasks, overrides],
  );
  const { planned, unplanned } = useMemo(() => planTasks(withDates), [withDates]);
  // Largeur disponible pour la frise : la période s'allonge pour remplir l'écran.
  const card = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(0);
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const measure = () => {
      const label = parseFloat(getComputedStyle(el).getPropertyValue("--gantt-label")) || 0;
      setTimelineWidth(el.clientWidth - label);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const minDays = Math.ceil(timelineWidth / dayWidth);
  const range = useMemo(() => ganttRange(planned.map((p) => p.span), today, minDays), [planned, today, minDays]);
  const months = useMemo(() => ganttMonths(range), [range]);
  const totalDays = spanDays(range);
  const width = totalDays * dayWidth;
  const todayOffset = barBox({ start: today, end: today }, range).offset;

  // Au premier affichage et à chaque changement d'échelle : aujourd'hui vers le tiers gauche.
  const scroller = useRef<HTMLDivElement>(null);
  const scrollToToday = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = todayOffset * dayWidth - el.clientWidth / 3;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(scrollToToday, [zoom]);

  /** Enregistre les nouvelles dates ; en cas d'échec, l'écran revient aux dates du serveur. */
  function save(task: TaskView, span: Span) {
    setTaskDates(task.id, { startDate: span.start, dueDate: span.end }).then((res) => {
      if (res.ok) return;
      toast(res.error, "error");
      setOverrides((o) => {
        const { [task.id]: _, ...rest } = o;
        return rest;
      });
    });
  }

  // --- Souris et tactile -------------------------------------------------------------------

  function onPointerDown(e: PointerEvent, task: TaskView, span: Span, mode: DragMode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ taskId: task.id, mode, span, originX: e.clientX, days: 0, moved: false });
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.originX;
    const moved = drag.moved || Math.abs(dx) >= DRAG_THRESHOLD;
    const days = Math.round(dx / dayWidth);
    if (moved !== drag.moved || days !== drag.days) setDrag({ ...drag, moved, days });
  }

  function onPointerUp(task: TaskView) {
    if (!drag) return;
    const { span, mode, days, moved } = drag;
    setDrag(null);
    // Simple clic : on ouvre la tâche.
    if (!moved) return editTask(task);
    if (days === 0) return;
    const next = shiftSpan(span, mode, days);
    setOverrides((o) => ({ ...o, [task.id]: next }));
    save(task, next);
  }

  // --- Clavier -----------------------------------------------------------------------------

  function onKeyDown(e: KeyboardEvent, task: TaskView, span: Span) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return editTask(task);
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = shiftSpan(span, e.shiftKey ? "end" : "move", e.key === "ArrowLeft" ? -1 : 1);
    setOverrides((o) => ({ ...o, [task.id]: next }));
    const timers = saveTimers.current;
    clearTimeout(timers.get(task.id));
    timers.set(
      task.id,
      setTimeout(() => {
        timers.delete(task.id);
        save(task, next);
      }, KEYBOARD_SAVE_DELAY),
    );
  }

  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // Grille de fond : un trait par lundi, et les week-ends grisés à l'échelle du jour. La période
  // commence un lundi, donc un motif répété toutes les semaines suffit.
  const week = 7 * dayWidth;
  const grid = [
    `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${week}px)`,
    ...(zoom === "jour"
      ? [`repeating-linear-gradient(to right, transparent 0 ${5 * dayWidth}px, var(--surface-2) ${5 * dayWidth}px ${week}px)`]
      : []),
  ].join(", ");

  return (
    <div className="space-y-4">
      <div ref={card} className="overflow-hidden rounded-xl border border-border bg-surface [--gantt-label:150px] md:[--gantt-label:280px]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/50 px-3 py-2">
          <p className="text-xs text-muted">
            <span className="hidden sm:inline">Glissez une barre pour la déplacer, ou tirez sur ses bords pour changer ses dates.</span>
            <span className="sm:hidden">Glissez une barre pour la déplacer.</span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={scrollToToday} className="h-7 rounded-md border border-border px-2.5 text-xs hover:bg-surface-2">
              Aujourd&apos;hui
            </button>
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="radiogroup" aria-label="Échelle">
              {(Object.keys(GANTT_ZOOMS) as GanttZoom[]).map((z) => (
                <button
                  key={z}
                  role="radio"
                  aria-checked={zoom === z}
                  onClick={() => setZoom(z)}
                  className={cn("h-6 rounded-md px-2 text-xs", zoom === z ? "bg-surface-2 font-medium" : "text-muted hover:text-text")}
                >
                  {GANTT_ZOOMS[z].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {planned.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            Aucune tâche datée ne correspond aux filtres. Donnez un début ou une échéance à une tâche pour la voir ici.
          </p>
        ) : (
          <div ref={scroller} className="max-h-[70vh] overflow-auto">
            <div className="relative" style={{ width: `calc(var(--gantt-label) + ${width}px)` }}>
              {/* En-tête : mois, puis jours (ou lundis) */}
              <div className="sticky top-0 z-20 flex border-b border-border bg-surface">
                <div className="sticky left-0 z-10 w-[var(--gantt-label)] shrink-0 border-r border-border bg-surface" />
                <div className="relative" style={{ width }}>
                  <div className="flex h-6 border-b border-border">
                    {months.map((m) => (
                      <div
                        key={m.key}
                        className="border-l border-border text-xs leading-6 font-medium capitalize first:border-l-0"
                        style={{ width: m.days * dayWidth }}
                        title={formatMonthYear(m.start)}
                      >
                        {/* Collé à gauche : le mois en cours reste lisible pendant le défilement. */}
                        {m.days * dayWidth >= 60 && (
                          <span className="sticky left-[var(--gantt-label)] inline-block px-1.5 whitespace-nowrap">{formatMonthYear(m.start)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <DayScale range={range} dayWidth={dayWidth} zoom={zoom} today={today} />
                </div>
              </div>

              {/* Grille, ligne d'aujourd'hui et lignes des tâches */}
              <div className="relative">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 left-[var(--gantt-label)]"
                  style={{ backgroundImage: grid }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-danger/70"
                  style={{ left: `calc(var(--gantt-label) + ${(todayOffset + 0.5) * dayWidth - 1}px)` }}
                />

                <ul>
                  {planned.map(({ task, span: saved }) => {
                    const dragging = drag?.taskId === task.id && drag.moved;
                    const span = dragging ? shiftSpan(drag.span, drag.mode, drag.days) : saved;
                    const box = barBox(span, range);
                    const barWidth = box.days * dayWidth;
                    const done = task.status === "done";
                    const overdue = !done && span.end < today;
                    const assignees = task.assigneeIds.map((id) => membersById.get(id)).filter((m) => !!m);
                    const dates =
                      span.start === span.end ? formatShort(span.start) : `du ${formatShort(span.start)} au ${formatShort(span.end)}`;
                    const labelInside = barWidth >= LABEL_INSIDE_MIN;

                    return (
                      <li key={task.id} className="flex border-b border-border last:border-b-0" style={{ height: ROW_HEIGHT }}>
                        <button
                          onClick={() => editTask(task)}
                          className="sticky left-0 z-10 flex w-[var(--gantt-label)] shrink-0 items-center gap-2 border-r border-border bg-surface px-3 text-left hover:bg-surface-2"
                        >
                          <StatusIcon status={task.status} size={14} />
                          <span className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted line-through")}>{task.title}</span>
                          {showProject && (
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: task.projectColor }} title={task.projectName} />
                          )}
                          <span className="hidden md:block">{assignees.length > 0 && <AvatarStack users={assignees} size={20} max={2} />}</span>
                        </button>

                        <div className="relative" style={{ width }}>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={`${task.title}, ${dates}${overdue ? ", en retard" : ""}. Flèches pour déplacer, Maj + flèches pour changer l'échéance, Entrée pour ouvrir.`}
                            title={`${task.title} · ${dates}`}
                            onPointerDown={(e) => onPointerDown(e, task, saved, "move")}
                            onPointerMove={onPointerMove}
                            onPointerUp={() => onPointerUp(task)}
                            onPointerCancel={() => setDrag(null)}
                            onKeyDown={(e) => onKeyDown(e, task, saved)}
                            className={cn(
                              "group absolute top-1.5 flex h-7 touch-none items-center rounded-md border text-xs font-medium select-none",
                              "cursor-grab focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              dragging && "z-20 cursor-grabbing shadow-lg",
                              task.status === "todo" && "border-border bg-surface-2 text-text",
                              task.status === "in_progress" && "border-accent bg-accent text-accent-fg",
                              done && "border-success/40 bg-success-soft text-success",
                              overdue && "border-danger ring-1 ring-danger",
                            )}
                            style={{ left: box.offset * dayWidth + 1, width: barWidth - 2 }}
                          >
                            <ResizeHandle side="start" onPointerDown={(e) => onPointerDown(e, task, saved, "start")} />
                            {labelInside && (
                              <span className="flex min-w-0 items-center gap-1.5 px-2.5">
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} />
                                <span className="truncate">{task.title}</span>
                              </span>
                            )}
                            <ResizeHandle side="end" onPointerDown={(e) => onPointerDown(e, task, saved, "end")} />
                          </div>
                          {!labelInside && (
                            <span
                              className="pointer-events-none absolute top-0 flex h-full items-center gap-1 text-xs whitespace-nowrap text-muted"
                              style={{ left: (box.offset + box.days) * dayWidth + 6 }}
                            >
                              {overdue && <AlertCircle size={12} className="text-danger" />}
                              {task.title}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {unplanned.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted">
            Sans dates ({unplanned.length}) : ouvrez une tâche pour lui donner un début ou une échéance.
          </p>
          <ul className="flex flex-wrap gap-2 p-3">
            {unplanned.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => editTask(t)}
                  className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent"
                >
                  <CalendarPlus size={12} />
                  <span className={cn("max-w-56 truncate", t.status === "done" && "line-through")}>{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Poignée d'un bord de barre : tirer dessus change le début ou l'échéance. */
function ResizeHandle({ side, onPointerDown }: { side: "start" | "end"; onPointerDown: (e: PointerEvent) => void }) {
  return (
    <span
      aria-hidden
      onPointerDown={onPointerDown}
      className={cn(
        "absolute inset-y-0 w-2 cursor-ew-resize rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/15",
        side === "start" ? "left-0" : "right-0",
      )}
    />
  );
}

/** Deuxième ligne de l'en-tête : chaque jour à l'échelle du jour, sinon chaque lundi. */
function DayScale({ range, dayWidth, zoom, today }: { range: Span; dayWidth: number; zoom: GanttZoom; today: string }) {
  const cells: { day: string; days: number }[] = [];
  const step = zoom === "jour" ? 1 : 7;
  for (let i = 0; i < spanDays(range); i += step) {
    const day = addDays(range.start, i);
    cells.push({ day, days: Math.min(step, spanDays(range) - i) });
  }

  return (
    <div className="flex h-7">
      {cells.map(({ day, days }) => {
        const isToday = zoom === "jour" && day === today;
        return (
          <div
            key={day}
            className={cn(
              "flex shrink-0 items-center justify-center overflow-hidden border-l border-border text-[11px] text-muted first:border-l-0",
              isToday && "font-semibold text-danger",
            )}
            style={{ width: days * dayWidth }}
            title={formatShort(day)}
          >
            {zoom === "jour" ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="text-[9px] uppercase">{formatWeekdayShort(day).slice(0, 1)}</span>
                {Number(day.slice(8))}
              </span>
            ) : zoom === "semaine" ? (
              formatShort(day)
            ) : (
              Number(day.slice(8))
            )}
          </div>
        );
      })}
    </div>
  );
}
