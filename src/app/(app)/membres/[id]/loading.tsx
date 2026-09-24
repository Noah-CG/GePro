import { PageSkeleton, SectionSkeleton, Skeleton, StatsSkeleton } from "@/components/ui/skeleton";

/** Fiche d'un membre : ses tâches. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement de la fiche du membre…" className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <StatsSkeleton />
      <Skeleton className="mb-6 h-24 w-full rounded-xl" />
      <div className="space-y-6">
        <SectionSkeleton rows={2} />
        <SectionSkeleton rows={3} />
      </div>
    </PageSkeleton>
  );
}
