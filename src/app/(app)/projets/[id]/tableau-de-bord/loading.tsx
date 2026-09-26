import { HeaderSkeleton, PageSkeleton, SectionSkeleton, StatsSkeleton } from "@/components/ui/skeleton";

/** Tableau de bord (et repli pour les pages sans squelette dédié). */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement du tableau de bord…" className="mx-auto max-w-6xl">
      <HeaderSkeleton actions={1} />
      <StatsSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <SectionSkeleton rows={3} />
          <SectionSkeleton rows={4} />
        </div>
        <div className="space-y-6">
          <SectionSkeleton rows={2} />
          <SectionSkeleton rows={4} avatar />
        </div>
      </div>
    </PageSkeleton>
  );
}
