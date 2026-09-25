import { Archive } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiscordButton } from "@/components/discord/discord-button";
import { ProjectDates, ProjectMenu } from "@/components/projects/project-card";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskBoard } from "@/components/tasks/task-board";
import { ProgressBar } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { isDiscordConfigured } from "@/lib/discord/client";
import { getDiscordChannelView } from "@/lib/discord/service";
import { getProjectsWithStats, getTasks } from "@/lib/queries";
import { percent } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

async function loadProject(id: string) {
  if (!UUID.test(id)) return null;
  const [project] = await getProjectsWithStats({ id, today: todayISO() });
  return project ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await loadProject((await params).id);
  return { title: project?.name ?? "Projet" };
}

export default async function ProjectPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const [tasks, discordChannel] = await Promise.all([getTasks({ projectId: id }), getDiscordChannelView(id)]);
  const pct = percent(project.done, project.total);
  const today = todayISO();

  return (
    <div className="mx-auto max-w-7xl">
      {project.archived && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          <Archive size={14} /> Ce projet est archivé : il n&apos;apparaît plus dans le tableau de bord ni dans les tâches.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: project.color }} />
            <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
            <ProjectMenu project={project} />
          </div>
          {project.description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{project.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex w-56 items-center gap-2.5 whitespace-nowrap">
              <ProgressBar value={pct} color={project.color} />
              <span className="text-xs font-medium tabular-nums">{pct} %</span>
            </div>
            <span className="text-xs text-muted">
              {project.done}/{project.total} terminées
              {project.overdue > 0 && <span className="text-danger"> · {project.overdue} en retard</span>}
            </span>
            <ProjectDates project={project} today={today} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DiscordButton projectId={project.id} channel={discordChannel} configured={isDiscordConfigured()} />
          <NewTaskButton />
        </div>
      </div>

      <TaskBoard tasks={tasks} projectId={project.id} />
    </div>
  );
}
