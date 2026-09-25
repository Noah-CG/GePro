import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Salon Discord en pleine page : en-tête, messages, saisie. */
export default function Loading() {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-5/12", "w-3/5"];
  return (
    <PageSkeleton
      label="Chargement du salon Discord…"
      className="mx-auto flex h-[calc(100dvh-9.75rem)] min-h-96 max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-surface md:h-[calc(100dvh-6.5rem)]"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex-1 space-y-5 overflow-hidden p-4">
        {widths.map((w, i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className={`h-3.5 ${w}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-3">
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </PageSkeleton>
  );
}
