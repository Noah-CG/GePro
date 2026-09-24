import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Lecture d'un PDF : en-tête, barre du lecteur et première page. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement du PDF…" className="mx-auto max-w-5xl">
      <Skeleton className="mb-4 h-4 w-24" />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mb-4 h-10 w-full rounded-lg" />
      <Skeleton className="mx-auto aspect-[1/1.414] w-full rounded-sm" />
    </PageSkeleton>
  );
}
