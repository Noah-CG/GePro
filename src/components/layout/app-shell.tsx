"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Menu, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DiscordProvider } from "@/components/discord/discord-provider";
import { DiscordTab } from "@/components/discord/discord-tab";
import type { DiscordChannelView } from "@/lib/discord/model";
import {
  COLLAPSED_SECTIONS_COOKIE,
  savePreferenceCookie,
  serializeCollapsedSections,
  SIDEBAR_COLLAPSED_COOKIE,
  type SidebarSectionId,
} from "@/lib/navigation-prefs";
import { useApp } from "./app-provider";
import { Sidebar, type SidebarData } from "./sidebar";
import { TabBar, TabPanel, TabsProvider } from "./tabs";

/** Salon Discord de chaque projet (onglet fixe de la barre d'onglets). */
export type DiscordShellData = { configured: boolean; channels: Record<string, DiscordChannelView> };

/** Préférences d'affichage lues dans les cookies par le layout. */
export type SidebarPrefs = { collapsed: boolean; collapsedSections: SidebarSectionId[] };

/**
 * Structure de page.
 * - Ordinateur : barre latérale (réductible aux icônes) + contenu.
 * - Mobile : en-tête ; la même barre latérale s'ouvre en tiroir.
 * Au-dessus du contenu, la barre d'onglets de GePro, précédée de l'onglet fixe Discord.
 */
export function AppShell({
  sidebar,
  prefs,
  discord,
  children,
}: {
  sidebar: SidebarData;
  prefs: SidebarPrefs;
  discord: DiscordShellData;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { newTask, currentProjectId } = useApp();
  const [collapsed, setCollapsed] = useState(prefs.collapsed);
  const [collapsedSections, setCollapsedSections] = useState(prefs.collapsedSections);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Le tiroir se referme dès qu'on change de page.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // …et si la fenêtre passe en largeur « ordinateur » : masqué mais ouvert, il bloquerait la page.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const close = () => desktop.matches && setDrawerOpen(false);
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    savePreferenceCookie(SIDEBAR_COLLAPSED_COOKIE, collapsed ? null : "1");
  };

  const toggleSection = (id: SidebarSectionId) => {
    const next = collapsedSections.includes(id) ? collapsedSections.filter((s) => s !== id) : [...collapsedSections, id];
    setCollapsedSections(next);
    savePreferenceCookie(COLLAPSED_SECTIONS_COOKIE, serializeCollapsedSections(next));
  };

  const project = sidebar.projects.find((p) => p.id === currentProjectId);
  const sidebarProps = { data: sidebar, collapsedSections, onToggleSection: toggleSection };

  return (
    <TabsProvider>
      <DiscordProvider configured={discord.configured} channels={discord.channels}>
        <div className="min-h-dvh md:flex">
          {/* Barre latérale (ordinateur) */}
          <aside className="sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface md:block">
            <Sidebar {...sidebarProps} idPrefix="sidebar" collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          </aside>

          {/* En-tête (mobile) */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-2 backdrop-blur md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
              aria-expanded={drawerOpen}
              aria-controls="menu-mobile"
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text"
            >
              <Menu size={20} />
            </button>
            <span className="min-w-0 flex-1 truncate font-semibold">{project?.name ?? "GePro"}</span>
            <button onClick={() => newTask()} aria-label="Nouvelle tâche" className="rounded-lg bg-accent p-2 text-accent-fg hover:opacity-90">
              <Plus size={18} />
            </button>
          </header>

          {/* Tiroir (mobile) : même contenu que la barre latérale */}
          <RadixDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <RadixDialog.Portal>
              <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden" />
              <RadixDialog.Content
                id="menu-mobile"
                aria-describedby={undefined}
                className="fixed inset-y-0 left-0 z-50 max-w-[85vw] overflow-hidden border-r border-border bg-surface shadow-2xl focus:outline-none md:hidden"
              >
                <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
                <Sidebar {...sidebarProps} idPrefix="menu-mobile-nav" collapsed={false} onClose={() => setDrawerOpen(false)} />
              </RadixDialog.Content>
            </RadixDialog.Portal>
          </RadixDialog.Root>

          <div className="flex min-w-0 flex-1 flex-col">
            <TabBar pinned={<DiscordTab />} />
            <TabPanel>
              <main className="px-4 pt-5 pb-10 sm:px-6 md:px-8 md:py-8">{children}</main>
            </TabPanel>
          </div>
        </div>
      </DiscordProvider>
    </TabsProvider>
  );
}
