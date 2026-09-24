import { HeaderSkeleton, PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Liste des projets : onglets Actifs / Archivés et cartes. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement des projets…" className="mx-auto max-w-6xl">
      <HeaderSkeleton actions={1} />
      <Skeleton className="mb-4 h-8 w-44 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
