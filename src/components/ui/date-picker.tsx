"use client";

/**
 * Sélecteur de date (bouton + calendrier dans un popover), d'après le Date Picker de shadcn/ui.
 * Remplace <input type="date"> : même rendu dans tous les navigateurs, en français.
 * La valeur reste une chaîne "YYYY-MM-DD" ("" = aucune date), comme dans le reste de l'app.
 */
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { formatLong } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Calendar } from "./calendar";

/** "2026-10-12" → date locale à minuit (le calendrier raisonne en heure locale). */
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date locale → "2026-10-12". */
function toISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Aucune date",
  min,
  "aria-label": ariaLabel,
}: {
  id?: string;
  /** "YYYY-MM-DD", ou "" pour aucune date. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Première date sélectionnable ("YYYY-MM-DD"), ex. la date de début pour une date de fin. */
  min?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromISO(value) : undefined;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm",
          "focus:border-accent focus:ring-2 focus:ring-ring/40 focus:outline-none data-[state=open]:border-accent",
          !value && "text-muted",
        )}
      >
        <CalendarDays size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{value ? formatLong(value) : placeholder}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 rounded-xl border border-border bg-surface text-text shadow-xl">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? (min ? fromISO(min) : undefined)}
            onSelect={(date) => pick(date ? toISO(date) : "")}
            disabled={min ? { before: fromISO(min) } : undefined}
            autoFocus
          />
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
            <button
              type="button"
              onClick={() => pick(toISO(new Date()))}
              disabled={!!min && toISO(new Date()) < min}
              className="font-medium text-accent hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Aujourd&apos;hui
            </button>
            {value && (
              <button type="button" onClick={() => pick("")} className="text-muted hover:text-text">
                Effacer
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
