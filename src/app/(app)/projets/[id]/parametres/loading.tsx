import { HeaderSkeleton, PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Paramètres d'un projet : cartes de réglages. */
export default function Loading() {
  return (
    <PageSkeleton label="Chargement des paramètres…" className="mx-auto max-w-3xl space-y-4">
      <HeaderSkeleton subtitle={false} />
      {[3, 2].map((fields, i) => (
        <div key={i} className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: fields }, (_, j) => (
            <div key={j} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </PageSkeleton>
  );
}
