"use client";

import * as Popover from "@radix-ui/react-popover";
import { AppWindow, Archive, ArchiveRestore, CalendarRange, MoreHorizontal, Pencil, Settings } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setProjectArchived } from "@/actions/projects";
import { useApp } from "@/components/layout/app-provider";
import { useTabs } from "@/components/layout/tabs";
import { Spinner } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/misc";
import { formatShort } from "@/lib/dates";
import type { ProjectWithStats } from "@/lib/queries";
import { cn, percent } from "@/lib/utils";

/** Période d'un projet : "3 sept. → 15 oct.". */
export function ProjectDates({ project, today }: { project: ProjectWithStats; today: string }) {
  if (!project.startDate && !project.endDate) return null;
  const late = !project.archived && project.endDate && project.endDate < today && project.done < project.total;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", late ? "text-danger" : "text-muted")}>
      <CalendarRange size={12} />
      {project.startDate ? formatShort(project.startDate) : "…"} → {project.endDate ? formatShort(project.endDate) : "…"}
    </span>
  );
}

/** Menu d'actions d'un projet : modifier, paramètres, ouvrir dans un onglet, archiver / désarchiver. */
export function ProjectMenu({ project }: { project: ProjectWithStats }) {
  const { editProject, toast } = useApp();
  const { openInNewTab } = useTabs();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggleArchive = () =>
    startTransition(async () => {
      const res = await setProjectArchived(project.id, !project.archived);
      setOpen(false);
      if (!res.ok) return toast(res.error, "error");
      toast(project.archived ? "Projet restauré" : "Projet archivé");
    });

  const row = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Actions du projet">
        <MoreHorizontal size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} className="z-50 w-60 rounded-xl border border-border bg-surface p-1 shadow-xl">
          <button
            className={row}
            onClick={() => {
              setOpen(false);
              editProject(project);
            }}
          >
            <Pencil size={14} className="text-muted" /> Modifier
          </button>
          <Link href={`/projets/${project.id}/parametres`} className={row} onClick={() => setOpen(false)}>
            <Settings size={14} className="text-muted" /> Paramètres
          </Link>
          <button
            className={row}
            onClick={() => {
              setOpen(false);
              openInNewTab(`/projets/${project.id}`);
            }}
          >
            <AppWindow size={14} className="text-muted" /> Ouvrir dans un nouvel onglet
          </button>
          <button className={row} onClick={toggleArchive} disabled={pending} aria-busy={pending || undefined}>
            {pending ? (
              <Spinner size={14} className="text-muted" />
            ) : project.archived ? (
              <ArchiveRestore size={14} className="text-muted" />
            ) : (
              <Archive size={14} className="text-muted" />
            )}
            {project.archived ? "Désarchiver" : "Archiver"}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ProjectCard({ project }: { project: ProjectWithStats }) {
  const { today } = useApp();
  const pct = percent(project.done, project.total);
  const open = project.total - project.done;

  return (
    <div className={cn("group relative flex flex-col rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md", project.archived && "opacity-70")}>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
        <Link href={`/projets/${project.id}`} className="min-w-0 flex-1 after:absolute after:inset-0">
          <h3 className="truncate font-medium">{project.name}</h3>
        </Link>
        {/* Au-dessus du lien étendu pour rester cliquable */}
        <div className="relative z-10 -mt-1 -mr-1">
          <ProjectMenu project={project} />
        </div>
      </div>
      {project.description && <p className="mb-4 line-clamp-2 text-sm text-muted">{project.description}</p>}

      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            {open} ouverte{open > 1 ? "s" : ""} · {project.inProgress} en cours
            {project.overdue > 0 && <span className="text-danger"> · {project.overdue} en retard</span>}
          </span>
          <span className="font-medium tabular-nums">{pct} %</span>
        </div>
        <ProgressBar value={pct} color={project.color} />
        <ProjectDates project={project} today={today} />
      </div>
    </div>
  );
}
