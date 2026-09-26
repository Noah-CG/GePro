/**
 * Contrôle d'accès aux projets, côté serveur uniquement. Toute lecture ou écriture de données
 * d'un projet passe par ici :
 *
 * - pages et Server Components : `requireProjectAccess(projectId)` → 404 si l'on n'est pas membre ;
 * - Server Actions : `authorizeProject(projectId)` ou, pour un objet désigné par son id (tâche,
 *   événement, fichier…), `authorizeProjectOf(kind, id)` → message « introuvable » ;
 * - routes API : `getProjectRole(userId, projectId)` → réponse 404.
 *
 * Un projet dont on n'est pas membre est traité exactement comme un projet inexistant : on ne
 * révèle jamais son existence. Un `project_id` venu du client n'est jamais cru sur parole.
 *
 * Rôles : owner (tous les droits, dont supprimer le projet) > admin (membres, invitations,
 * paramètres) > member (contenu : tâches, calendrier, documents…). Le rôle global « admin » d'un
 * compte ne sert qu'à gérer les comptes : il ne donne aucun droit sur les projets.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import {
  externalResources,
  importantDays,
  projectEvents,
  projectFiles,
  projectMembers,
  tasks,
  type ProjectRole,
} from "@/db/schema";
import { requireUser, type SessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/validation";

export type { ProjectRole };

const RANK: Record<ProjectRole, number> = { member: 1, admin: 2, owner: 3 };

/** Vrai si `role` donne au moins les droits de `min`. */
export const atLeast = (role: ProjectRole, min: ProjectRole) => RANK[role] >= RANK[min];

export const PROJECT_NOT_FOUND = "Projet introuvable.";

const FORBIDDEN: Record<Exclude<ProjectRole, "member">, string> = {
  admin: "Seuls le propriétaire et les administrateurs du projet peuvent faire cela.",
  owner: "Seul le propriétaire du projet peut faire cela.",
};

export type ProjectAccess = { user: SessionUser; projectId: string; role: ProjectRole };
export type AccessResult = { ok: true; access: ProjectAccess } | { ok: false; error: string };

/** Rôle de `userId` dans le projet, ou null s'il n'en est pas membre (ou si le projet n'existe pas). */
export async function getProjectRole(userId: string, projectId: unknown): Promise<ProjectRole | null> {
  if (typeof projectId !== "string" || !isUuid(projectId)) return null;
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

/**
 * Pour les pages : utilisateur connecté (sinon /login) et membre du projet avec au moins `minRole`
 * (sinon 404). Mis en cache pour la durée d'une requête (layout, page et métadonnées).
 */
export const requireProjectAccess = cache(async (projectId: string, minRole: ProjectRole = "member"): Promise<ProjectAccess> => {
  const user = await requireUser();
  const role = await getProjectRole(user.id, projectId);
  if (!role || !atLeast(role, minRole)) notFound();
  return { user, projectId, role };
});

/** Pour les Server Actions : accès au projet, ou message d'erreur (« Projet introuvable. » si non membre). */
export async function authorizeProject(projectId: unknown, minRole: ProjectRole = "member"): Promise<AccessResult> {
  const user = await requireUser();
  const role = await getProjectRole(user.id, projectId);
  if (!role) return { ok: false, error: PROJECT_NOT_FOUND };
  if (!atLeast(role, minRole)) return { ok: false, error: FORBIDDEN[minRole as Exclude<ProjectRole, "member">] };
  return { ok: true, access: { user, projectId: projectId as string, role } };
}

/** Objets désignés par leur id, et le projet auquel chacun appartient. */
const OWNED = {
  task: { table: tasks, id: tasks.id, projectId: tasks.projectId, notFound: "Tâche introuvable." },
  event: { table: projectEvents, id: projectEvents.id, projectId: projectEvents.projectId, notFound: "Événement introuvable." },
  importantDay: {
    table: importantDays,
    id: importantDays.id,
    projectId: importantDays.projectId,
    notFound: "Journée importante introuvable.",
  },
  file: { table: projectFiles, id: projectFiles.id, projectId: projectFiles.projectId, notFound: "Fichier introuvable." },
  resource: {
    table: externalResources,
    id: externalResources.id,
    projectId: externalResources.projectId,
    notFound: "Document introuvable.",
  },
} as const;

export type OwnedKind = keyof typeof OWNED;

/** Projet auquel appartient l'objet, ou null s'il n'existe pas. */
export async function projectIdOf(kind: OwnedKind, id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !isUuid(id)) return null;
  const { table, id: idColumn, projectId } = OWNED[kind];
  const [row] = await db.select({ projectId }).from(table).where(eq(idColumn, id)).limit(1);
  return row?.projectId ?? null;
}

/**
 * Pour les Server Actions qui visent un objet par son id : il doit appartenir à un projet dont
 * l'utilisateur est membre (avec au moins `minRole`). Sinon, l'objet est « introuvable », qu'il
 * existe dans un autre projet ou non.
 */
export async function authorizeProjectOf(kind: OwnedKind, id: unknown, minRole: ProjectRole = "member"): Promise<AccessResult> {
  const user = await requireUser();
  const projectId = await projectIdOf(kind, id);
  const role = projectId ? await getProjectRole(user.id, projectId) : null;
  if (!projectId || !role) return { ok: false, error: OWNED[kind].notFound };
  if (!atLeast(role, minRole)) return { ok: false, error: FORBIDDEN[minRole as Exclude<ProjectRole, "member">] };
  return { ok: true, access: { user, projectId, role } };
}
