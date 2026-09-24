import type { TaskView } from "@/lib/queries";
import { percent } from "@/lib/utils";

/** Répartition terminées / en cours / pas commencées d'un ensemble de tâches (barre + légende). */
export function TaskRates({ tasks }: { tasks: Pick<TaskView, "status">[] }) {
  const count = (status: TaskView["status"]) => tasks.filter((t) => t.status === status).length;
  const rates = [
    { label: "Terminées", count: count("done"), color: "var(--success)" },
    { label: "En cours", count: count("in_progress"), color: "var(--accent)" },
    { label: "Pas commencées", count: count("todo"), color: "var(--muted)" },
  ];

  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={rates.map((r) => `${r.label} : ${percent(r.count, tasks.length)} %`).join(", ")}
      >
        {rates.map((r) => (
          <div key={r.label} className="h-full transition-[width] duration-500" style={{ width: `${(r.count / Math.max(1, tasks.length)) * 100}%`, background: r.color }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-3">
        {rates.map((r) => (
          <li key={r.label} className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-xs text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
              {r.label}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {percent(r.count, tasks.length)} %<span className="ml-1.5 text-xs font-normal text-muted">({r.count})</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
