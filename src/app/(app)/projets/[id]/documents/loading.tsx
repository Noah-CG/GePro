import { HeaderSkeleton, PageSkeleton, SectionSkeleton } from "@/components/ui/skeleton";

/** Documents d'un projet : PDF puis Google Docs. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement des documents…" className="mx-auto max-w-4xl space-y-4">
      <HeaderSkeleton />
      <SectionSkeleton rows={2} />
      <SectionSkeleton rows={2} />
    </PageSkeleton>
  );
}
