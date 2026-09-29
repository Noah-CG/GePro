"use server";

import { and, desc, eq, or, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projects, tasks, type TaskStatus } from "@/db/schema";
import { getProjectRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { foldText } from "@/lib/utils";
import { searchQuery } from "@/lib/validation";

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

/** Lettres accentuées courantes et leur équivalent sans accent (le même que foldText, côté client). */
const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿ";
const FOLD_FROM = ACCENTED + ACCENTED.toUpperCase();
const FOLD_TO = [...FOLD_FROM].map(foldText).join("");

/**
 * `column` contient le motif, sans tenir compte de la casse ni des accents : « edito » trouve
 * « l'Édito ». translate() plutôt que l'extension unaccent, pour marcher sur Neon comme sur PGlite.
 */
const matches = (column: AnyColumn, pattern: string) => sql`translate(lower(${column}), ${FOLD_FROM}, ${FOLD_TO}) like ${pattern}`;

/**
 * Recherche simple (titre + description, insensible à la casse et aux accents), dans ses propres projets
 * seulement. Les tâches sont limitées au projet sélectionné, s'il est bien l'un d'eux ; les
 * projets trouvés servent à changer de projet.
 */
export async function search(query: string, projectId: string | null): Promise<SearchResults> {
  const me = await requireUser();
  const parsed = searchQuery.safeParse(query);
  const q = parsed.success ? parsed.data : "";
  if (q.length < 2) return { projects: [], tasks: [] };
  // Échappe les jokers SQL saisis par l'utilisateur.
  const pattern = `%${foldText(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // Sans projet sélectionné dont on est membre, aucune tâche.
  const taskProjectId = projectId && (await getProjectRole(me.id, projectId)) ? projectId : null;

  const [projectRows, taskRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, color: projects.color, archivedAt: projects.archivedAt })
      .from(projects)
      .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, me.id)))
      .where(or(matches(projects.name, pattern), matches(projects.description, pattern)))
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
          .where(and(eq(tasks.projectId, taskProjectId), or(matches(tasks.title, pattern), matches(tasks.description, pattern))))
          .orderBy(desc(tasks.updatedAt))
          .limit(10)
      : [],
  ]);

  return {
    projects: projectRows.map(({ archivedAt, ...p }) => ({ ...p, archived: archivedAt !== null })),
    tasks: taskRows,
  };
}
