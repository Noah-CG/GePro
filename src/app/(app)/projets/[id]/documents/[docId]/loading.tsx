import { PageSkeleton, Skeleton, TextSkeleton } from "@/components/ui/skeleton";

/** Lecture d'un Google Doc. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement du document…" className="mx-auto max-w-3xl">
      <Skeleton className="mb-4 h-4 w-24" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-44 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mb-5 h-6 w-2/3" />
      <TextSkeleton lines={9} />
    </PageSkeleton>
  );
}
