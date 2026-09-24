"use server";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks, type TaskStatus } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/validation";

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
 * Recherche simple (titre + description, insensible à la casse). Les tâches sont limitées au
 * projet sélectionné ; les projets trouvés servent à changer de projet.
 */
export async function search(query: string, projectId: string | null): Promise<SearchResults> {
  await requireUser();
  const q = query.trim();
  if (q.length < 2) return { projects: [], tasks: [] };
  // Échappe les jokers SQL saisis par l'utilisateur.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // Sans projet sélectionné valide, aucune tâche : le site n'affiche que le projet sélectionné.
  const taskProjectId = projectId && isUuid(projectId) ? projectId : null;

  const [projectRows, taskRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, color: projects.color, archivedAt: projects.archivedAt })
      .from(projects)
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
