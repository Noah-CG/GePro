import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Invitation à un projet. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement de l'invitation…" className="mx-auto max-w-lg pt-10">
      <div className="space-y-3 rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-72" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>
    </PageSkeleton>
  );
}
