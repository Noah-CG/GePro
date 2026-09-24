"use client";

import { FolderKanban, LayoutDashboard, ListTodo, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";
import { UserMenu } from "./user-menu";

const NAV = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
  { href: "/taches", label: "Tâches", short: "Tâches", icon: ListTodo },
  { href: "/projets", label: "Projets", short: "Projets", icon: FolderKanban },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm text-accent-fg">G</span>
      GePro
    </Link>
  );
}

/**
 * Structure de page : barre latérale sur ordinateur,
 * en-tête + barre de navigation en bas de l'écran sur mobile.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { projects, newTask, openSearch } = useApp();
  const activeProjects = projects.filter((p) => !p.archived);

  return (
    <div className="min-h-dvh md:flex">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
        <div className="px-2 pb-4">
          <Logo />
        </div>

        <button
          onClick={() => newTask()}
          className="mb-2 flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          <Plus size={16} /> Nouvelle tâche
          <span className="ml-auto rounded bg-white/20 px-1.5 text-[10px]">N</span>
        </button>
        <button
          onClick={openSearch}
          className="mb-4 flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted hover:bg-surface-2"
        >
          <Search size={15} /> Rechercher
          <span className="ml-auto flex gap-0.5">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <nav className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                isActive(pathname, href) ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 mb-1 px-2.5 text-xs font-medium text-muted">Projets actifs</div>
        <nav className="scroll-thin -mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
          {activeProjects.map((p) => (
            <Link
              key={p.id}
              href={`/projets/${p.id}`}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm",
                pathname.startsWith(`/projets/${p.id}`) ? "bg-surface-2 font-medium" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-border pt-3">
          <UserMenu />
        </div>
      </aside>

      {/* En-tête (mobile) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden">
        <Logo />
        <UserMenu compact />
      </header>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 md:px-8 md:py-8">{children}</main>

      {/* Navigation basse (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.slice(0, 2).map(({ href, short, icon: Icon }) => (
          <MobileLink key={href} href={href} label={short} active={isActive(pathname, href)} icon={<Icon size={20} />} />
        ))}
        <div className="flex items-center justify-center">
          <button
            onClick={() => newTask()}
            aria-label="Nouvelle tâche"
            className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg"
          >
            <Plus size={22} />
          </button>
        </div>
        <MobileLink href="/projets" label="Projets" active={isActive(pathname, "/projets")} icon={<FolderKanban size={20} />} />
        <button onClick={openSearch} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted">
          <Search size={20} /> Chercher
        </button>
      </nav>
    </div>
  );
}

function MobileLink({ href, label, active, icon }: { href: string; label: string; active: boolean; icon: ReactNode }) {
  return (
    <Link href={href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-accent" : "text-muted")}>
      {icon}
      {label}
    </Link>
  );
}
