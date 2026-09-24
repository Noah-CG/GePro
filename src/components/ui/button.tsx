import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "bg-surface border border-border hover:bg-surface-2",
  ghost: "hover:bg-surface-2 text-muted hover:text-text",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-sm gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  icon: "h-8 w-8 justify-center",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Action en cours : spinner à la place de l'icône, bouton désactivé et signalé occupé. */
  loading?: boolean;
};

/** Classes d'un bouton, pour donner le même aspect à un lien. */
export function buttonClass({ variant = "secondary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // Pendant le chargement, le spinner remplace l'icône de tête (s'il y en a une).
      className={buttonClass({ variant, size, className: cn(loading && "cursor-progress [&>svg:first-child:not([data-spinner])]:hidden", className) })}
      {...props}
    >
      {children}
      {loading && <Spinner size={size === "icon" ? 15 : 14} />}
    </button>
  );
});

/** Indicateur de chargement (décoratif : le bouton ou la zone parente porte `aria-busy`). */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 data-spinner aria-hidden size={size} className={cn("order-first shrink-0 motion-safe:animate-spin", className)} />;
}
