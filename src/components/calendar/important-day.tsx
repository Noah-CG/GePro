"use client";

import * as Popover from "@radix-ui/react-popover";
import { Pencil, Star } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { formatDayLong } from "@/lib/dates";
import type { ImportantDayView } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Titre d'une journée importante, en blanc sur sa couleur, avec une étoile pour la reconnaître
 * sans voir les couleurs. Survol (souris) ou tap : une infobulle affiche la description et un
 * bouton pour modifier la journée. `variant` : "cell" (case de la vue Mois, titre centré en gros)
 * ou "band" (bandeau pleine largeur des vues Semaine et mobile).
 */
export function ImportantDayTitle({
  day,
  variant,
  tabIndex,
  onEdit,
}: {
  day: ImportantDayView;
  variant: "cell" | "band";
  tabIndex?: number;
  onEdit: (day: ImportantDayView) => void;
}) {
  const [open, setOpen] = useState(false);
  // Le survol ouvre l'infobulle ; un petit délai à la sortie laisse le temps d'y entrer.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = (next: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (next) setOpen(true);
    else closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const mouseOnly = (fn: () => void) => (e: PointerEvent) => e.pointerType === "mouse" && fn();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        tabIndex={tabIndex}
        aria-label={`Journée importante : ${day.title}${day.description ? `. ${day.description}` : ""}`}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        onPointerEnter={mouseOnly(() => hover(true))}
        onPointerLeave={mouseOnly(() => hover(false))}
        className={cn(
          "flex min-w-0 items-center gap-1.5 font-bold text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
          variant === "cell" ? "w-full flex-1 justify-center rounded-md px-1 text-center text-base leading-tight lg:text-lg" : "w-full rounded-md text-left text-sm",
        )}
      >
        <Star size={variant === "cell" ? 14 : 13} className="shrink-0 fill-current" aria-hidden />
        <span className="line-clamp-2 min-w-0 break-words">{day.title}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          onPointerEnter={mouseOnly(() => hover(true))}
          onPointerLeave={mouseOnly(() => hover(false))}
          onClick={(e) => e.stopPropagation()}
          // Ouverte au survol : le focus reste où il est.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-72 rounded-xl border border-border bg-surface p-3 text-sm shadow-xl"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: day.color }}>
              <Star size={11} className="fill-current" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold break-words">{day.title}</p>
              <p className="text-xs text-muted first-letter:uppercase">{formatDayLong(day.date)}</p>
            </div>
          </div>
          <p className={cn("mt-2 whitespace-pre-line break-words", !day.description && "text-muted")}>{day.description || "Pas de description."}</p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit(day);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
          >
            <Pencil size={12} /> Modifier ou retirer
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Bandeau coloré pleine largeur (vues Semaine et mobile), avec le titre de la journée importante. */
export function ImportantDayBand({
  day,
  tabIndex,
  onEdit,
  className,
}: {
  day: ImportantDayView;
  tabIndex?: number;
  onEdit: (day: ImportantDayView) => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md px-2 py-1.5", className)} style={{ background: day.color }}>
      <ImportantDayTitle day={day} variant="band" tabIndex={tabIndex} onEdit={onEdit} />
    </div>
  );
}
