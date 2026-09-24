import { HeaderSkeleton, PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Tâches d'un projet : filtres puis colonnes du Kanban. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement des tâches…" className="mx-auto max-w-7xl">
      <HeaderSkeleton actions={2} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-32 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[3, 2, 4].map((cards, col) => (
          <div key={col} className="space-y-2 rounded-xl bg-surface-2/50 p-2">
            <Skeleton className="m-1 h-4 w-24" />
            {Array.from({ length: cards }, (_, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
