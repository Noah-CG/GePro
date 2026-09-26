import { HeaderSkeleton, PageSkeleton, SectionSkeleton, Skeleton, StatsSkeleton } from "@/components/ui/skeleton";

/** Temps de travail : chrono, chiffres, journal et temps de l'équipe. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement du temps de travail…" className="mx-auto max-w-6xl">
      <HeaderSkeleton />
      <div className="mb-6 flex items-center gap-5 rounded-xl border border-border bg-surface p-5">
        <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="hidden space-y-2 sm:block">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <StatsSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SectionSkeleton rows={6} />
        <div className="space-y-6">
          <SectionSkeleton rows={3} />
          <SectionSkeleton rows={3} avatar />
        </div>
      </div>
    </PageSkeleton>
  );
}
