"use server";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, tasks, type TaskStatus } from "@/db/schema";
import { getProjectRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export type SearchResults = {
  projects: { id: string; name: string; color: string; archived: boolean }[];
  tasks: {
    id: string;
    title: string;
    status: TaskStatus;
    projectId: string;
    projectName: string;
    projectColor: string;
  }[];
};

/**
 * Recherche simple (titre + description, insensible à la casse), dans ses propres projets
 * seulement. Les tâches sont limitées au projet sélectionné, s'il est bien l'un d'eux ; les
 * projets trouvés servent à changer de projet.
 */
export async function search(query: string, projectId: string | null): Promise<SearchResults> {
  const me = await requireUser();
  const q = query.trim();
  if (q.length < 2) return { projects: [], tasks: [] };
  // Échappe les jokers SQL saisis par l'utilisateur.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // Sans projet sélectionné dont on est membre, aucune tâche.
  const taskProjectId = projectId && (await getProjectRole(me.id, projectId)) ? projectId : null;

  const [projectRows, taskRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, color: projects.color, archivedAt: projects.archivedAt })
      .from(projects)
      .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, me.id)))
      .where(or(ilike(projects.name, pattern), ilike(projects.description, pattern)))
      .orderBy(desc(projects.updatedAt))
      .limit(5),
    taskProjectId
      ? db
          .select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            projectId: tasks.projectId,
            projectName: projects.name,
            projectColor: projects.color,
          })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(and(eq(tasks.projectId, taskProjectId), or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))))
          .orderBy(desc(tasks.updatedAt))
          .limit(10)
      : [],
  ]);

  return {
    projects: projectRows.map(({ archivedAt, ...p }) => ({ ...p, archived: archivedAt !== null })),
    tasks: taskRows,
  };
}
