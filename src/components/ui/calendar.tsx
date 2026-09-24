"use client";

/**
 * Calendrier (react-day-picker), d'après le composant Calendar de shadcn/ui, adapté aux couleurs
 * de l'application : en français, semaine commençant le lundi, navigation au clavier (flèches,
 * Page préc./suiv., Début/Fin) conforme WCAG.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { cn } from "@/lib/utils";

const navButton =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-40";

export function Calendar({ className, classNames, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={fr}
      weekStartsOn={1}
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        root: "relative",
        months: "flex flex-col",
        month: "space-y-3",
        month_caption: "flex h-7 items-center justify-center text-sm font-medium capitalize",
        nav: "absolute inset-x-3 top-3 flex items-center justify-between",
        button_previous: navButton,
        button_next: navButton,
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-xs font-normal text-muted capitalize",
        week: "mt-1 flex w-full",
        day: "group/jour relative h-9 w-9 p-0 text-center text-sm",
        day_button: cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg tabular-nums transition-colors hover:bg-surface-2",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
          // Aujourd'hui (hors sélection) en couleur d'accent ; le jour choisi, sur fond d'accent.
          "group-data-[today]/jour:font-semibold group-data-[today]/jour:text-accent",
          "group-data-[selected]/jour:bg-accent group-data-[selected]/jour:font-medium group-data-[selected]/jour:text-accent-fg",
        ),
        outside: "text-muted opacity-50",
        disabled: "pointer-events-none opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (orientation === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />),
      }}
      {...props}
    />
  );
}
