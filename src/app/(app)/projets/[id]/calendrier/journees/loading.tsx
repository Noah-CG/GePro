import { HeaderSkeleton, ListRowsSkeleton, PageSkeleton } from "@/components/ui/skeleton";

/** Journées importantes du projet. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement des journées importantes…" className="mx-auto max-w-3xl">
      <HeaderSkeleton actions={2} />
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <ListRowsSkeleton rows={5} avatar />
      </div>
    </PageSkeleton>
  );
}
