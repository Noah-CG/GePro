import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ProgressBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${value}%`, background: color ?? "var(--accent)" }}
      />
    </div>
  );
}

/** Touche de raccourci clavier. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[10px] font-medium text-muted">
      {children}
    </kbd>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-border bg-surface", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Info-bulle affichée à droite d'un élément (barre latérale réduite), au survol comme au focus
 * clavier. Le parent doit porter les classes `group relative` et un `aria-label` équivalent.
 */
export function SideTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-md bg-text px-2 py-1 text-xs font-medium whitespace-nowrap text-bg opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

const TONES = {
  danger: "text-danger bg-danger-soft",
  warning: "text-warning bg-warning-soft",
  accent: "text-accent bg-accent-soft",
  success: "text-success bg-success-soft",
};

/** Chiffre clé (tableau de bord, fiche membre), cliquable si `href` est fourni. */
export function Stat({ icon, label, value, tone, href }: { icon: ReactNode; label: string; value: ReactNode; tone?: keyof typeof TONES; href?: string }) {
  const body = (
    <Card className="flex items-center gap-3 p-4">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tone ? TONES[tone] : "bg-surface-2 text-muted")}>{icon}</span>
      <div>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Carte avec un en-tête : titre, compteur facultatif et action à droite. */
export function Section({ title, count, tone, action, children }: { title: string; count?: number; tone?: "danger"; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className={cn("rounded-full px-1.5 text-xs font-medium", tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>{count}</span>
        )}
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </Card>
  );
}
