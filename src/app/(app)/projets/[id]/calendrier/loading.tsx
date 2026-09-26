import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Calendrier : en-tête de période puis grille du mois (liste des jours sur mobile). */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement du calendrier…" className="flex flex-col md:h-[calc(100dvh-6.5rem)]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
      </div>
      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border md:flex">
        <div className="grid grid-cols-7 gap-px border-b border-border bg-border">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="bg-surface px-2 py-2">
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 grid-rows-5 gap-px bg-border">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="space-y-1.5 bg-surface p-2">
              <Skeleton className="h-3 w-5" />
              {i % 3 === 0 && <Skeleton className="h-4 w-full rounded" />}
              {i % 5 === 1 && <Skeleton className="h-4 w-4/5 rounded" />}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
