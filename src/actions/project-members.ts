"use server";

/**
 * Membres d'un projet et invitations. On n'entre dans un projet que sur invitation : pour un email
 * exact, pour un nom d'utilisateur exact, ou par un lien ouvert (rôle membre seulement).
 * Aucune recherche ni liste parmi les comptes de l'application ; accepter n'ajoute qu'à ce projet.
 *
 * - inviter, créer ou révoquer un lien, retirer un membre, changer un rôle : propriétaire et
 *   administrateurs du projet ;
 * - transférer la propriété : propriétaire ;
 * - quitter le projet : tout membre sauf le propriétaire.
 */
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  googleCalendarSyncProjects,
  projectInvitations,
  projectInviteLinks,
  projectInviteLinkUses,
  projectMembers,
  taskAssignees,
  tasks,
  users,
} from "@/db/schema";
import { atLeast, authorizeProject, getProjectRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { scheduleReconcile } from "@/lib/integrations/calendar-sync";
import { hashInvitationToken, INVITATION_DAYS, newInvitationToken } from "@/lib/invitations";
import { isInvitationFor, type Invitee } from "@/lib/queries";
import {
  firstError,
  invitationInput,
  inviteLinkInput,
  isUuid,
  memberRoleInput,
  usernameInvitationInput,
  type InvitationInput,
  type InviteLinkInput,
  type UsernameInvitationInput,
} from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

const INVITATION_NOT_FOUND = "Invitation introuvable, expirée ou déjà utilisée.";
const LINK_NOT_FOUND = "Ce lien d'invitation est invalide, a expiré, a été révoqué ou a atteint son nombre d'utilisations.";
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
    .where(sql`lower(${users.email}) = ${email}`)
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

/**
 * Invite un compte désigné par son nom d'utilisateur exact (casse indifférente) : aucune recherche
 * ni liste des comptes. La personne voit l'invitation dans GePro (page Projets, entrée
 * « Invitations » de la barre latérale) ; aucun email n'est envoyé.
 */
export async function inviteByUsername(
  projectId: string,
  input: UsernameInvitationInput,
): Promise<ActionResult<{ name: string }>> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  const parsed = usernameInvitationInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { username, role } = parsed.data;

  const [invitee] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);
  if (!invitee) return fail("Aucun compte avec ce nom d'utilisateur.");
  if (await getProjectRole(invitee.id, projectId)) return fail("Cette personne est déjà membre du projet.");

  await db
    .update(projectInvitations)
    .set({ status: "revoked" })
    .where(
      and(eq(projectInvitations.projectId, projectId), eq(projectInvitations.invitedUserId, invitee.id), eq(projectInvitations.status, "pending")),
    );
  const token = newInvitationToken();
  await db.insert(projectInvitations).values({
    projectId,
    invitedUserId: invitee.id,
    role,
    tokenHash: hashInvitationToken(token),
    invitedBy: auth.access.user.id,
    expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
  });
  refresh();

  return ok({ name: invitee.name });
}

/**
 * Crée un lien d'invitation ouvert : quiconque l'a peut entrer dans le projet, comme simple membre
 * (jamais administrateur), jusqu'à expiration, révocation ou épuisement de ses utilisations.
 * Renvoie le chemin du lien, montré une seule fois.
 */
export async function createInviteLink(projectId: string, input: InviteLinkInput): Promise<ActionResult<{ path: string }>> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  const parsed = inviteLinkInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const token = newInvitationToken();
  await db.insert(projectInviteLinks).values({
    projectId,
    tokenHash: hashInvitationToken(token),
    role: "member",
    maxUses: parsed.data.maxUses,
    expiresAt: new Date(Date.now() + parsed.data.days * 86_400_000),
    createdBy: auth.access.user.id,
  });
  refresh();
  return ok({ path: `/rejoindre/${token}` });
}

/** Révoque un lien d'invitation : il ne fait plus entrer personne (les membres déjà entrés restent). */
export async function revokeInviteLink(linkId: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!isUuid(linkId)) return fail(LINK_NOT_FOUND);
  const [link] = await db.select({ projectId: projectInviteLinks.projectId }).from(projectInviteLinks).where(eq(projectInviteLinks.id, linkId));
  // Lien d'un projet dont on n'est pas membre : introuvable, comme un lien inexistant.
  const role = link ? await getProjectRole(me.id, link.projectId) : null;
  if (!role) return fail(LINK_NOT_FOUND);
  if (!atLeast(role, "admin")) return fail("Seuls le propriétaire et les administrateurs du projet peuvent faire cela.");

  await db.update(projectInviteLinks).set({ revokedAt: new Date() }).where(and(eq(projectInviteLinks.id, linkId), isNull(projectInviteLinks.revokedAt)));
  refresh();
  return ok(undefined);
}

/**
 * Rejoint un projet avec un lien d'invitation ouvert, pour le compte connecté.
 * En une seule instruction : utilisation comptée (sans jamais dépasser le maximum, même avec des
 * clics simultanés), membre ajouté et utilisation journalisée. Déjà membre : rien n'est consommé.
 */
export async function joinWithInviteLink(token: string): Promise<ActionResult<{ projectId: string }>> {
  const me = await requireUser();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(token)) return fail(LINK_NOT_FOUND);
  const tokenHash = hashInvitationToken(token);

  const result = await db.execute<{ project_id: string }>(sql`
    with link as (
      update ${projectInviteLinks} set use_count = use_count + 1
      where token_hash = ${tokenHash} and revoked_at is null and expires_at > now()
        and (max_uses is null or use_count < max_uses)
        and not exists (
          select 1 from ${projectMembers} m
          where m.project_id = ${projectInviteLinks.projectId} and m.user_id = ${me.id}::uuid
        )
      returning id, project_id, role
    ),
    joined as (
      insert into ${projectMembers} (project_id, user_id, role)
      select project_id, ${me.id}::uuid, role from link
      on conflict (project_id, user_id) do nothing
      returning project_id
    ),
    logged as (
      insert into ${projectInviteLinkUses} (link_id, user_id)
      select id, ${me.id}::uuid from link
      on conflict do nothing
    )
    select project_id from joined
  `);
  const [joined] = result.rows;
  if (joined) {
    refresh();
    return ok({ projectId: joined.project_id });
  }

  // Rien de consommé : déjà membre (le lien mène simplement au projet), ou lien inutilisable.
  const [link] = await db.select({ projectId: projectInviteLinks.projectId }).from(projectInviteLinks).where(eq(projectInviteLinks.tokenHash, tokenHash));
  if (link && (await getProjectRole(me.id, link.projectId))) return ok({ projectId: link.projectId });
  return fail(LINK_NOT_FOUND);
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

/**
 * Invitation en attente et valable, désignée par son lien ou son id, adressée au compte connecté :
 * par son nom d'utilisateur, ou par son email exact.
 */
async function findMyInvitation(ref: { token: string } | { id: string }, me: Invitee) {
  if ("id" in ref && !isUuid(ref.id)) return null;
  const [invitation] = await db
    .select({
      id: projectInvitations.id,
      projectId: projectInvitations.projectId,
      role: projectInvitations.role,
      email: projectInvitations.email,
      invitedUserId: projectInvitations.invitedUserId,
    })
    .from(projectInvitations)
    .where(
      and(
        "token" in ref ? eq(projectInvitations.tokenHash, hashInvitationToken(ref.token)) : eq(projectInvitations.id, ref.id),
        eq(projectInvitations.status, "pending"),
        gt(projectInvitations.expiresAt, new Date()),
        // Seul le compte visé peut l'accepter, même avec le lien.
        or(eq(projectInvitations.invitedUserId, me.id), eq(projectInvitations.email, me.email.toLowerCase())),
      ),
    );
  return invitation && isInvitationFor(invitation, me) ? invitation : null;
}

/**
 * Accepte une invitation (lien reçu, ou liste des invitations) : ajoute le compte connecté à ce
 * projet seulement, avec le rôle prévu. L'invitation est consommée et l'ajout fait en une seule
 * instruction SQL.
 */
export async function acceptInvitation(ref: { token: string } | { id: string }): Promise<ActionResult<{ projectId: string }>> {
  const me = await requireUser();
  const invitation = await findMyInvitation(ref, me);
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
  const invitation = await findMyInvitation(ref, me);
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

  // Une seule instruction (fonction SQL de la migration 0012) : jamais zéro ni deux propriétaires.
  await db.execute(sql`select transfer_project_ownership(${projectId}::uuid, ${userId}::uuid)`);
  refresh();
  return ok(undefined);
}
