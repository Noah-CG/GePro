"use client";

import { CalendarDays, FolderPlus, LayoutDashboard, MonitorPlay, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, SquareKanban, Users, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Kbd, SideTooltip } from "@/components/ui/misc";
import type { SidebarSectionId } from "@/lib/navigation-prefs";
import type { ProjectWithStats, ResourceLink } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";
import { ProjectSwitcher } from "./project-switcher";
import { SidebarDocuments, type GoogleSidebarState } from "./sidebar-documents";
import { itemClass, SidebarContext, SidebarNavItem, SidebarSection } from "./sidebar-parts";
import { UserMenu } from "./user-menu";

/** Données de la barre latérale, chargées par le layout. */
export type SidebarData = {
  /** Tous les projets (archivés compris), avec leurs compteurs. */
  projects: ProjectWithStats[];
  /** Documents rattachés, tous projets confondus. */
  resources: ResourceLink[];
  google: GoogleSidebarState;
};

/**
 * Barre latérale unique, entièrement consacrée au projet sélectionné : sélecteur de projet tout
 * en haut, actions, tableau de bord et tâches du projet, ses documents, l'administration, puis
 * en bas ses paramètres et le compte.
 *
 * - `collapsed` : réduite aux icônes, avec info-bulles (ordinateur).
 * - `onToggleCollapsed` : bouton réduire / déplier (ordinateur).
 * - `onClose` : bouton fermer (tiroir mobile).
 */
export function Sidebar({
  data,
  collapsed,
  collapsedSections,
  onToggleSection,
  onToggleCollapsed,
  onClose,
  idPrefix,
}: {
  data: SidebarData;
  collapsed: boolean;
  collapsedSections: SidebarSectionId[];
  onToggleSection: (id: SidebarSectionId) => void;
  onToggleCollapsed?: () => void;
  onClose?: () => void;
  idPrefix: string;
}) {
  const pathname = usePathname();
  const { me, newTask, newProject, openSearch, currentProjectId } = useApp();

  const project = data.projects.find((p) => p.id === currentProjectId) ?? null;
  const base = project ? `/projets/${project.id}` : "";

  const context = {
    collapsed,
    idPrefix,
    isSectionCollapsed: (id: SidebarSectionId) => collapsedSections.includes(id),
    toggleSection: onToggleSection,
  };

  const iconButton = itemClass({ active: false, collapsed: true });

  const toggleButton = onToggleCollapsed && (
    <button
      onClick={onToggleCollapsed}
      aria-label={collapsed ? "Déplier la barre latérale" : "Réduire la barre latérale"}
      aria-expanded={!collapsed}
      aria-controls={idPrefix}
      className={collapsed ? iconButton : "shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"}
    >
      {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={17} />}
      {collapsed && <SideTooltip label="Déplier la barre" />}
    </button>
  );

  return (
    <SidebarContext.Provider value={context}>
      <nav id={idPrefix} aria-label="Navigation principale" className={cn("flex h-full flex-col py-3", collapsed ? "w-16 items-center" : "w-64 px-3")}>
        {/* Tout en haut : le projet sélectionné */}
        <div className={cn("mb-3 flex items-center", collapsed ? "flex-col gap-2" : "gap-1")}>
          {project ? (
            <div className="min-w-0 flex-1">
              <ProjectSwitcher current={project} projects={data.projects} iconOnly={collapsed} />
            </div>
          ) : (
            <button
              onClick={newProject}
              aria-label="Créer un projet"
              className={collapsed ? iconButton : "flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted hover:text-text"}
            >
              <FolderPlus size={collapsed ? 18 : 16} className="shrink-0" />
              {collapsed ? <SideTooltip label="Créer un projet" /> : "Créer un projet"}
            </button>
          )}
          {toggleButton}
          {onClose && (
            <button onClick={onClose} aria-label="Fermer le menu" className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Actions */}
        {collapsed ? (
          <div className="mb-3 flex flex-col items-center gap-1">
            <button onClick={() => newTask()} aria-label="Nouvelle tâche (N)" className="group relative flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-fg hover:opacity-90">
              <Plus size={18} />
              <SideTooltip label="Nouvelle tâche · N" />
            </button>
            <button onClick={openSearch} aria-label="Rechercher (Ctrl K)" className={iconButton}>
              <Search size={18} />
              <SideTooltip label="Rechercher · Ctrl K" />
            </button>
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            <button
              onClick={() => newTask()}
              className="flex h-9 w-full items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={16} /> Nouvelle tâche
              <span className="ml-auto rounded bg-white/20 px-1.5 text-[10px]">N</span>
            </button>
            <button
              onClick={openSearch}
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted hover:bg-surface-2"
            >
              <Search size={15} /> Rechercher
              <span className="ml-auto flex gap-0.5">
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          </div>
        )}

        {/* Navigation du projet (seule cette zone défile) */}
        <div className={cn("scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto", collapsed ? "flex flex-col items-center" : "-mx-1 px-1")}>
          <div className={cn("space-y-0.5", collapsed && "flex flex-col items-center gap-1 space-y-0")}>
            <SidebarNavItem href="/" icon={LayoutDashboard} label="Tableau de bord" active={pathname === "/"} />
            {project && (
              <SidebarNavItem
                href={base}
                icon={SquareKanban}
                label="Tâches"
                tooltip={`Tâches · ${project.total - project.done} ouvertes`}
                active={pathname === base}
                badge={project.total - project.done}
              />
            )}
            <SidebarNavItem href="/calendrier" icon={CalendarDays} label="Calendrier" active={pathname.startsWith("/calendrier")} />
            <SidebarNavItem href="/ecrans" icon={MonitorPlay} label="Multi-écran" active={pathname.startsWith("/ecrans")} />
          </div>

          {project && (
            <SidebarDocuments projectId={project.id} resources={data.resources.filter((r) => r.projectId === project.id)} google={data.google} />
          )}

          {me.role === "admin" && (
            <SidebarSection id="administration" title="Administration">
              <SidebarNavItem href="/membres" icon={Users} label="Membres" active={pathname.startsWith("/membres")} />
            </SidebarSection>
          )}
        </div>

        {/* En bas : paramètres du projet, puis le compte */}
        <div className={cn("mt-3 space-y-2 border-t border-border pt-3", collapsed ? "flex flex-col items-center space-y-0 gap-2" : "w-full")}>
          {project && (
            <SidebarNavItem href={`${base}/parametres`} icon={Settings} label="Paramètres du projet" active={pathname === `${base}/parametres`} />
          )}
          <UserMenu compact={collapsed} side={collapsed ? "right" : "bottom"} />
        </div>
      </nav>
    </SidebarContext.Provider>
  );
}
