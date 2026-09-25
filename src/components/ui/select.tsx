"use client";

/**
 * Liste déroulante accessible (Radix Select), d'après le composant Select de shadcn/ui, adapté aux
 * couleurs de l'application. Remplace le <select> natif : même rendu partout, navigation au
 * clavier (flèches, recherche par frappe, Échap) et attributs ARIA fournis par Radix.
 */
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

/** xs : barres d'outils denses (filtres des tâches). */
type SelectSize = "xs" | "sm" | "md";

export function SelectTrigger({ className, children, size = "md", ...props }: ComponentProps<typeof SelectPrimitive.Trigger> & { size?: SelectSize }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        // Largeur choisie par l'appelant (pleine largeur par défaut dans SimpleSelect).
        "flex items-center justify-between gap-2 rounded-lg border border-border bg-surface text-left whitespace-nowrap",
        "focus:border-accent focus:ring-2 focus:ring-ring/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "data-[placeholder]:text-muted [&>span]:min-w-0 [&>span]:truncate",
        size === "xs" ? "h-7 gap-1.5 px-2 text-xs" : size === "sm" ? "h-8 px-2.5 text-sm" : "h-9 px-3 text-sm",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = "popper", ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={4}
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-32 overflow-hidden rounded-xl border border-border bg-surface text-text shadow-xl",
          position === "popper" && "w-full min-w-(--radix-select-trigger-width)",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
          <ChevronUp size={14} />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
          <ChevronDown size={14} />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label className={cn("px-2.5 py-1.5 text-xs text-muted", className)} {...props} />;
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-sm outline-none select-none",
        "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2.5 flex items-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={14} className="text-accent" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /** Pastille de couleur devant le libellé (projet, priorité…) : classe Tailwind ou couleur CSS. */
  dot?: string;
  /** Séparateur affiché avant cette option. */
  separatorBefore?: boolean;
};

/** Raccourci pour le cas courant : une valeur, une liste d'options. */
export function SimpleSelect<T extends string>({
  value,
  onValueChange,
  options,
  size,
  className,
  id,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  size?: SelectSize;
  className?: string;
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={className ?? "w-full"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => [
          o.separatorBefore && <SelectSeparator key={`${o.value}-separateur`} />,
          <SelectItem key={o.value} value={o.value}>
            {o.dot && <Dot color={o.dot} />}
            {o.label}
          </SelectItem>,
        ])}
      </SelectContent>
    </Select>
  );
}

/** Pastille : une couleur CSS (#rrggbb) ou une classe Tailwind (bg-…). */
function Dot({ color }: { color: string }) {
  const isClass = color.startsWith("bg-");
  return (
    <span
      className={cn("mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle", isClass && color)}
      style={isClass ? undefined : { background: color }}
      aria-hidden
    />
  );
}
