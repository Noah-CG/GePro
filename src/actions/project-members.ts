"use server";

/**
 * Membres d'un projet et invitations. On n'entre dans un projet que sur invitation, pour un email
 * exact (aucune recherche parmi les comptes de l'application) ; accepter n'ajoute qu'à ce projet.
 *
 * - inviter, retirer un membre, changer un rôle : propriétaire et administrateurs du projet ;
 * - transférer la propriété : propriétaire ;
 * - quitter le projet : tout membre sauf le propriétaire.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { googleCalendarSyncProjects, projectInvitations, projectMembers, taskAssignees, tasks, users } from "@/db/schema";
import { atLeast, authorizeProject, getProjectRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { scheduleReconcile } from "@/lib/integrations/calendar-sync";
import { hashInvitationToken, INVITATION_DAYS, newInvitationToken } from "@/lib/invitations";
import { firstError, invitationInput, isUuid, memberRoleInput, type InvitationInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

const INVITATION_NOT_FOUND = "Invitation introuvable, expirée ou déjà utilisée.";
const MEMBER_NOT_FOUND = "Membre introuvable.";

/**
 * Invite `email` dans le projet. Renvoie le chemin du lien d'invitation, montré une seule fois
 * (la base n'en garde que le hash). Une invitation en attente pour le même email est remplacée.
 * La réponse est la même que l'email ait un compte ou non : on ne révèle pas les comptes existants.
 */
export async function inviteMember(projectId: string, input: InvitationInput): Promise<ActionResult<{ path: string }>> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  const parsed = invitationInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { email, role } = parsed.data;

  const [alreadyMember] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, projectId)))
    .where(eq(users.email, email))
    .limit(1);
  if (alreadyMember) return fail("Cette personne est déjà membre du projet.");

  await db
    .update(projectInvitations)
    .set({ status: "revoked" })
    .where(and(eq(projectInvitations.projectId, projectId), eq(projectInvitations.email, email), eq(projectInvitations.status, "pending")));

  const token = newInvitationToken();
  await db.insert(projectInvitations).values({
    projectId,
    email,
    role,
    tokenHash: hashInvitationToken(token),
    invitedBy: auth.access.user.id,
    expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
  });
  refresh();
  return ok({ path: `/invitations/${token}` });
}

/** Annule une invitation en attente. */
export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!isUuid(invitationId)) return fail(INVITATION_NOT_FOUND);
  const [invitation] = await db
    .select({ projectId: projectInvitations.projectId })
    .from(projectInvitations)
    .where(and(eq(projectInvitations.id, invitationId), eq(projectInvitations.status, "pending")));
  // Invitation d'un projet dont on n'est pas membre : introuvable, comme une invitation inexistante.
  const role = invitation ? await getProjectRole(me.id, invitation.projectId) : null;
  if (!role) return fail(INVITATION_NOT_FOUND);
  if (!atLeast(role, "admin")) return fail("Seuls le propriétaire et les administrateurs du projet peuvent faire cela.");

  await db.update(projectInvitations).set({ status: "revoked" }).where(eq(projectInvitations.id, invitationId));
  refresh();
  return ok(undefined);
}

/** Invitation en attente et valable, adressée au compte connecté, désignée par son lien ou son id. */
async function findMyInvitation(ref: { token: string } | { id: string }, email: string) {
  if ("id" in ref && !isUuid(ref.id)) return null;
  const [invitation] = await db
    .select({ id: projectInvitations.id, projectId: projectInvitations.projectId, role: projectInvitations.role })
    .from(projectInvitations)
    .where(
      and(
        "token" in ref ? eq(projectInvitations.tokenHash, hashInvitationToken(ref.token)) : eq(projectInvitations.id, ref.id),
        eq(projectInvitations.status, "pending"),
        gt(projectInvitations.expiresAt, new Date()),
        // Seul le compte qui a exactement cet email peut l'accepter, même avec le lien.
        eq(projectInvitations.email, email.toLowerCase()),
      ),
    );
  return invitation ?? null;
}

/**
 * Accepte une invitation (lien reçu, ou liste des invitations) : ajoute le compte connecté à ce
 * projet seulement, avec le rôle prévu. L'invitation est consommée et l'ajout fait en une seule
 * instruction SQL.
 */
export async function acceptInvitation(ref: { token: string } | { id: string }): Promise<ActionResult<{ projectId: string }>> {
  const me = await requireUser();
  const invitation = await findMyInvitation(ref, me.email);
  if (!invitation) return fail(INVITATION_NOT_FOUND);

  await db.execute(sql`
    with accepted as (
      update ${projectInvitations} set status = 'accepted', accepted_at = now()
      where id = ${invitation.id}::uuid and status = 'pending'
      returning project_id, role
    )
    insert into ${projectMembers} (project_id, user_id, role)
    select project_id, ${me.id}::uuid, role from accepted
    on conflict (project_id, user_id) do nothing
  `);
  // Invitation acceptée entre-temps (double clic) : le compte est membre dans les deux cas.
  if (!(await getProjectRole(me.id, invitation.projectId))) return fail(INVITATION_NOT_FOUND);
  refresh();
  return ok({ projectId: invitation.projectId });
}

/** Refuse une invitation reçue. */
export async function declineInvitation(ref: { token: string } | { id: string }): Promise<ActionResult> {
  const me = await requireUser();
  const invitation = await findMyInvitation(ref, me.email);
  if (!invitation) return fail(INVITATION_NOT_FOUND);
  await db.update(projectInvitations).set({ status: "revoked" }).where(eq(projectInvitations.id, invitation.id));
  refresh();
  return ok(undefined);
}

/** Rôle d'un membre du projet, ou null s'il n'en fait pas partie (ou si l'id est invalide). */
const memberRole = async (userId: string, projectId: string) => (isUuid(userId) ? getProjectRole(userId, projectId) : null);

/** Change le rôle d'un membre (administrateur ou membre). Le propriétaire ne change que par transfert. */
export async function setMemberRole(projectId: string, userId: string, role: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  const parsed = memberRoleInput.safeParse(role);
  if (!parsed.success) return fail("Rôle invalide.");
  const current = await memberRole(userId, projectId);
  if (!current) return fail(MEMBER_NOT_FOUND);
  if (current === "owner") return fail("Le rôle du propriétaire ne change que par un transfert de propriété.");

  await db
    .update(projectMembers)
    .set({ role: parsed.data })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  refresh();
  return ok(undefined);
}

/**
 * Retire l'accès d'un membre au projet : ses affectations aux tâches du projet et le choix du
 * projet dans son agenda Google disparaissent avec lui. Ce qu'il a créé reste dans le projet.
 */
async function removeFromProject(projectId: string, userId: string) {
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  await db
    .delete(taskAssignees)
    .where(
      and(
        eq(taskAssignees.userId, userId),
        inArray(taskAssignees.taskId, db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId))),
      ),
    );
  await db
    .delete(googleCalendarSyncProjects)
    .where(and(eq(googleCalendarSyncProjects.projectId, projectId), eq(googleCalendarSyncProjects.userId, userId)));
  // Les éléments du projet quittent son agenda Google.
  await scheduleReconcile([userId]);
}

/** Retire un membre du projet (pas le propriétaire ; un administrateur ne retire pas un autre administrateur). */
export async function removeMember(projectId: string, userId: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  if (userId === auth.access.user.id) return fail("Pour partir, utilisez « Quitter le projet ».");
  const current = await memberRole(userId, projectId);
  if (!current) return fail(MEMBER_NOT_FOUND);
  if (current === "owner") return fail("Le propriétaire ne peut pas être retiré du projet.");
  if (current === "admin" && !atLeast(auth.access.role, "owner")) {
    return fail("Seul le propriétaire peut retirer un administrateur.");
  }

  await removeFromProject(projectId, userId);
  refresh();
  return ok(undefined);
}

/** Quitte le projet. Le propriétaire doit d'abord transmettre la propriété (ou supprimer le projet). */
export async function leaveProject(projectId: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId);
  if (!auth.ok) return fail(auth.error);
  if (auth.access.role === "owner") {
    return fail("Le propriétaire ne peut pas quitter le projet : transmettez-en d'abord la propriété, ou supprimez-le.");
  }
  await removeFromProject(projectId, auth.access.user.id);
  refresh();
  return ok(undefined);
}

/** Transmet la propriété à un autre membre ; l'ancien propriétaire devient administrateur. */
export async function transferOwnership(projectId: string, userId: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId, "owner");
  if (!auth.ok) return fail(auth.error);
  if (userId === auth.access.user.id) return fail("Vous êtes déjà propriétaire du projet.");
  if (!(await memberRole(userId, projectId))) return fail(MEMBER_NOT_FOUND);

  // Une seule instruction (fonction SQL de la migration 0011) : jamais zéro ni deux propriétaires.
  await db.execute(sql`select transfer_project_ownership(${projectId}::uuid, ${userId}::uuid)`);
  refresh();
  return ok(undefined);
}
