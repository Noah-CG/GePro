import { AlertCircle, Calendar, CheckCircle2, Circle, CircleDashed } from "lucide-react";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/constants";
import { diffDays, formatDue } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Couleur de pastille par priorité (réutilisée dans les filtres et formulaires). */
export const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-muted",
};

export function PriorityBadge({ priority, compact }: { priority: TaskPriority; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`Priorité ${PRIORITY_LABEL[priority].toLowerCase()}`}>
      <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[priority])} />
      {!compact && PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusIcon({ status, size = 16 }: { status: TaskStatus; size?: number }) {
  if (status === "done") return <CheckCircle2 size={size} className="text-success" />;
  if (status === "in_progress") return <CircleDashed size={size} className="text-accent" />;
  return <Circle size={size} className="text-muted" />;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        status === "done" && "bg-success-soft text-success",
        status === "in_progress" && "bg-accent-soft text-accent",
        status === "todo" && "bg-surface-2 text-muted",
      )}
    >
      <StatusIcon status={status} size={12} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Échéance colorée : rouge si en retard, orange si aujourd'hui/demain. */
export function DueBadge({ dueDate, today, done }: { dueDate: string | null; today: string; done?: boolean }) {
  if (!dueDate) return null;
  const diff = diffDays(dueDate, today);
  const overdue = !done && diff < 0;
  const soon = !done && diff >= 0 && diff <= 1;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap",
        overdue ? "font-medium text-danger" : soon ? "text-warning" : "text-muted",
      )}
    >
      {overdue ? <AlertCircle size={12} /> : <Calendar size={12} />}
      {formatDue(dueDate, today)}
    </span>
  );
}
