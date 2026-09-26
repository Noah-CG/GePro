/**
 * Chargement commun des pages /projets/[id]/… (page et métadonnées) : 404 si l'on n'est pas
 * membre du projet (voir lib/access.ts). Mis en cache pour la durée d'une requête.
 */
import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireProjectAccess, type ProjectAccess, type ProjectRole } from "./access";
import { todayISO } from "./dates";
import { getProjectsWithStats, type ProjectWithStats } from "./queries";

export const loadProjectPage = cache(
  async (id: string, minRole: ProjectRole = "member"): Promise<ProjectAccess & { project: ProjectWithStats }> => {
    const access = await requireProjectAccess(id, minRole);
    const [project] = await getProjectsWithStats(access.user.id, { id, today: todayISO() });
    if (!project) notFound();
    return { ...access, project };
  },
);
