/**
 * Squelettes de chargement : la forme de la page s'affiche aussitôt, en attendant ses données.
 *
 * Accessibilité : la zone annonce « Chargement… » une seule fois aux lecteurs d'écran
 * (role="status"), les blocs gris eux-mêmes sont masqués, et l'animation s'arrête pour qui a
 * demandé moins de mouvement (prefers-reduced-motion).
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bloc gris animé, à dimensionner avec `className`. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn("rounded-md bg-surface-2 motion-safe:animate-pulse", className)} style={style} />;
}

/** Page en cours de chargement : annonce `label` aux lecteurs d'écran et garde la largeur de la page. */
export function PageSkeleton({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** En-tête de page : titre, sous-titre et éventuels boutons à droite. */
export function HeaderSkeleton({ actions = 0, subtitle = true }: { actions?: number; subtitle?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        {subtitle && <Skeleton className="h-4 w-72 max-w-[70vw]" />}
      </div>
      {actions > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Rangée de chiffres clés (tableau de bord, temps de travail…). */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-4">
          <Skeleton className="mb-3 h-8 w-8 rounded-lg" />
          <Skeleton className="mb-2 h-6 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Carte titrée contenant une liste (sections du tableau de bord, journal…). */
export function SectionSkeleton({ rows = 3, avatar = false, className }: { rows?: number; avatar?: boolean; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      <ListRowsSkeleton rows={rows} avatar={avatar} />
    </div>
  );
}

/** Lignes d'une liste : pastille ou avatar, deux lignes de texte, valeur à droite. */
export function ListRowsSkeleton({ rows = 3, avatar = false }: { rows?: number; avatar?: boolean }) {
  // Largeurs variées : un squelette trop régulier se lit comme un motif, pas comme du texte.
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-5/12", "w-3/5"];
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className={avatar ? "h-7 w-7 shrink-0 rounded-full" : "h-4 w-4 shrink-0 rounded-full"} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn("h-3.5", widths[i % widths.length])} />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Paragraphes de texte (lecture d'un document). */
export function TextSkeleton({ lines = 8 }: { lines?: number }) {
  const widths = [100, 96, 98, 88, 94, 72, 97, 91, 60];
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${widths[i % widths.length]}%` }} />
      ))}
    </div>
  );
}
