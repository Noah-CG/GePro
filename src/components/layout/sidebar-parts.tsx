"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";
import { SideTooltip } from "@/components/ui/misc";
import type { SidebarSectionId } from "@/lib/navigation-prefs";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  /** Barre réduite aux icônes (ordinateur). */
  collapsed: boolean;
  /** Préfixe des id HTML : la barre existe en double (ordinateur + tiroir mobile). */
  idPrefix: string;
  isSectionCollapsed: (id: SidebarSectionId) => boolean;
  toggleSection: (id: SidebarSectionId) => void;
};

export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar doit être utilisé dans <Sidebar>");
  return ctx;
}

/** Classes d'un élément de la barre : l'élément actif a un fond, du gras et une barre d'accent. */
export function itemClass({ active, collapsed, className }: { active: boolean; collapsed: boolean; className?: string }) {
  return cn(
    "group relative flex items-center rounded-lg text-sm transition-colors",
    collapsed ? "h-10 w-10 justify-center" : "gap-2.5 px-2.5 py-2",
    active
      ? "bg-surface-2 font-medium text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
      : "text-muted hover:bg-surface-2 hover:text-text",
    className,
  );
}

/** Lien de navigation : icône + libellé, ou icône + info-bulle quand la barre est réduite. */
export function SidebarNavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
  tooltip,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  /** Compteur affiché à droite (barre dépliée). */
  badge?: number;
  /** Texte de l'info-bulle en mode réduit (par défaut : le libellé). */
  tooltip?: string;
}) {
  const { collapsed } = useSidebar();
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? (tooltip ?? label) : undefined}
      className={itemClass({ active, collapsed })}
    >
      <Icon size={collapsed ? 18 : 16} className="shrink-0" />
      {collapsed ? (
        <SideTooltip label={tooltip ?? label} />
      ) : (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="rounded-md bg-surface-2 px-1.5 text-[11px] leading-5 font-medium text-muted tabular-nums group-hover:bg-surface">
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

/**
 * Groupe d'éléments avec un titre. Repliable (état mémorisé) quand `id` est fourni.
 * En mode réduit, le titre devient un simple séparateur et le contenu reste visible.
 */
export function SidebarSection({
  id,
  title,
  action,
  children,
}: {
  id: SidebarSectionId;
  title: string;
  /** Bouton affiché à droite du titre (ex. « + »). */
  action?: ReactNode;
  children: ReactNode;
}) {
  const { collapsed, idPrefix, isSectionCollapsed, toggleSection } = useSidebar();
  const contentId = `${idPrefix}-section-${id}`;

  if (collapsed) {
    return (
      <div role="group" aria-label={title} className="flex flex-col items-center gap-1 border-t border-border pt-3">
        {children}
      </div>
    );
  }

  const closed = isSectionCollapsed(id);
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 pr-1">
        <h2 className="min-w-0 flex-1">
          <button
            onClick={() => toggleSection(id)}
            aria-expanded={!closed}
            aria-controls={contentId}
            className="flex w-full items-center gap-1 rounded-md px-2.5 py-1 text-left text-xs font-medium tracking-wide text-muted uppercase hover:text-text"
          >
            <span className="truncate">{title}</span>
            <ChevronDown size={13} className={cn("shrink-0 transition-transform", closed && "-rotate-90")} aria-hidden />
          </button>
        </h2>
        {action}
      </div>
      <div id={contentId} hidden={closed} className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}
