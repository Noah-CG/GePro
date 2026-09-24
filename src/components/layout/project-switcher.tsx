"use client";

import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, FolderKanban, Plus, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { projectSwitchHref } from "@/lib/current-project";
import { SideTooltip } from "@/components/ui/misc";
import type { ProjectWithStats } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";

/** Minuscules, sans accents : « Équipe » est trouvé en tapant « equipe ». */
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Filtre « contient » sur le nom du projet (plus prévisible que la recherche approchée par défaut). */
const containsFilter = (_value: string, search: string, keywords?: string[]) =>
  normalize((keywords ?? []).join(" ")).includes(normalize(search.trim())) ? 1 : 0;

const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm data-[selected=true]:bg-surface-2";
const group = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted";

/** Pastille carrée aux couleurs du projet, avec son initiale. */
function ProjectAvatar({ project, size = 32 }: { project: { name: string; color: string }; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
      style={{ background: project.color, width: size, height: size }}
      aria-hidden
    >
      {project.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** "5 ouvertes · 2 en retard", ou "Archivé". */
function summary(project: ProjectWithStats): string {
  if (project.archived) return "Archivé";
  const open = project.total - project.done;
  const parts = [`${open} tâche${open > 1 ? "s" : ""} ouverte${open > 1 ? "s" : ""}`];
  if (project.overdue > 0) parts.push(`${project.overdue} en retard`);
  return parts.join(" · ");
}

/**
 * Sélecteur de projet (à la Vercel / Supabase) : le projet en cours, et au clic une liste
 * filtrable au clavier. Changer de projet garde la même section (Tâches, Documents, Paramètres).
 */
export function ProjectSwitcher({
  current,
  projects,
  iconOnly,
}: {
  current: ProjectWithStats;
  projects: ProjectWithStats[];
  /** Barre latérale réduite : seule la pastille du projet est affichée. */
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { newProject, selectProject } = useApp();
  const [open, setOpen] = useState(false);

  const active = projects.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  // Un projet archivé consulté reste visible (et coché) dans la liste.
  const list = current.archived ? [current, ...active] : active;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const choose = (id: string) => {
    setOpen(false);
    selectProject(id);
    // Page d'un projet : même section dans le nouveau projet. Ailleurs (tableau de bord…) : on
    // reste, et la page se recalcule côté serveur avec le projet choisi.
    const href = projectSwitchHref(pathname, id);
    if (href) router.push(href);
    else router.refresh();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Projet : ${current.name}. Changer de projet`}
        className={cn(
          "group relative flex min-w-0 items-center rounded-lg text-left transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2",
          iconOnly ? "p-1" : "w-full gap-2.5 px-2 py-2",
        )}
      >
        <ProjectAvatar project={current} size={32} />
        {iconOnly ? (
          <SideTooltip label={`${current.name} · changer de projet`} />
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{current.name}</span>
              <span className="block truncate text-xs text-muted">{summary(current)}</span>
            </span>
            <ChevronsUpDown size={15} className="shrink-0 text-muted" />
          </>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side={iconOnly ? "right" : "bottom"}
          align="start"
          sideOffset={6}
          className="z-50 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <Command loop label="Changer de projet" filter={containsFilter}>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search size={14} className="text-muted" />
              <Command.Input
                autoFocus
                placeholder="Rechercher un projet…"
                className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <Command.List className="scroll-thin max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="px-2.5 py-4 text-center text-sm text-muted">Aucun projet trouvé</Command.Empty>
              <Command.Group heading="Projets" className={group}>
                {list.map((p) => (
                  <Command.Item key={p.id} value={p.id} keywords={[p.name]} onSelect={() => choose(p.id)} className={item}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.archived && <span className="text-xs text-muted">Archivé</span>}
                    {p.id === current.id && <Check size={14} className="shrink-0 text-accent" aria-label="Projet en cours" />}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Separator className="my-1.5 h-px bg-border" alwaysRender />
              <Command.Item
                forceMount
                value="nouveau projet"
                onSelect={() => {
                  setOpen(false);
                  newProject();
                }}
                className={item}
              >
                <Plus size={15} className="text-muted" /> Nouveau projet
              </Command.Item>
              <Command.Item forceMount value="tous les projets" onSelect={() => go("/projets")} className={item}>
                <FolderKanban size={15} className="text-muted" /> Tous les projets
              </Command.Item>
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
