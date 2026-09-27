import { PageSkeleton, SectionSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Administration des comptes. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement des comptes…" className="mx-auto max-w-3xl">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <SectionSkeleton rows={5} avatar />
    </PageSkeleton>
  );
}
