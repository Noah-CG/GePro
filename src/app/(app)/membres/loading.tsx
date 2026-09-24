import { HeaderSkeleton, ListRowsSkeleton, PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Membres de l'équipe. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement des membres…" className="mx-auto max-w-3xl">
      <HeaderSkeleton />
      <div className="mb-4 flex justify-end">
        <Skeleton className="h-9 w-44 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <ListRowsSkeleton rows={6} avatar />
      </div>
    </PageSkeleton>
  );
}
