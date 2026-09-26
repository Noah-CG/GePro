import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectInvitations, projectInviteLinks, projectInviteLinkUses, projectMembers, projects, taskAssignees, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import { afterLoginPath } from "@/lib/invitations";
import { getInviteLinks, getPendingInvitations, getReceivedInvitations } from "@/lib/queries";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import {
  acceptInvitation,
  createInviteLink,
  declineInvitation,
  inviteByUsername,
  inviteMember,
  joinWithInviteLink,
  revokeInviteLink,
  leaveProject,
  removeMember,
  revokeInvitation,
  setMemberRole,
  transferOwnership,
} from "./project-members";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(),
}));

type User = Awaited<ReturnType<typeof insertUser>>;
let owner: User;
let admin: User;
let member: User;
let outsider: User;
let projectId: string;

const actAs = (user: User) => vi.mocked(requireUser).mockResolvedValue({ ...user, role: "member" });
const tokenOf = (path: string) => path.split("/").pop()!;
const roles = async () =>
  Object.fromEntries(
    (await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId))).map((m) => [m.userId, m.role]),
  );

async function invite(email: string, role: "admin" | "member" = "member", as = owner) {
  actAs(as);
  const res = await inviteMember(projectId, { email, role });
  if (!res.ok) throw new Error(res.error);
  return tokenOf(res.data.path);
}

beforeEach(async () => {
  vi.mocked(sendEmail).mockResolvedValue({ ok: true });
  await resetDb(db);
  owner = await insertUser(db, "Alice Propriétaire");
  admin = await insertUser(db, "Hugo Admin");
  member = await insertUser(db, "Léa Membre");
  outsider = await insertUser(db, "Bob Extérieur");
  projectId = (await insertProject(db, "Refonte du site", owner.id)).id;
  await addMember(db, projectId, admin.id, "admin");
  await addMember(db, projectId, member.id);
});

describe("invitations", () => {
  it("le lien n'est valable que pour le compte invité, et n'ajoute qu'à ce projet", async () => {
    const other = (await insertProject(db, "Autre projet d'Alice", owner.id)).id;
    const token = await invite(outsider.email.toUpperCase());

    // Un autre compte ne peut pas l'utiliser, même avec le lien.
    actAs(member);
    expect(await acceptInvitation({ token })).toEqual({ ok: false, error: "Invitation introuvable, expirée ou déjà utilisée." });

    actAs(outsider);
    expect(await getReceivedInvitations(outsider)).toMatchObject([{ projectId, projectName: "Refonte du site", role: "member" }]);
    expect(await acceptInvitation({ token })).toEqual({ ok: true, data: { projectId } });
    expect((await roles())[outsider.id]).toBe("member");
    const otherMembers = await db.select().from(projectMembers).where(eq(projectMembers.projectId, other));
    expect(otherMembers.map((m) => m.userId)).toEqual([owner.id]);

    // Un lien ne sert qu'une fois.
    expect(await acceptInvitation({ token })).toMatchObject({ ok: false });
    expect(await getReceivedInvitations(outsider)).toEqual([]);
  });

  it("donne le rôle prévu par l'invitation", async () => {
    await invite(outsider.email, "admin", admin);
    actAs(outsider);
    const [received] = await getReceivedInvitations(outsider);
    expect(await acceptInvitation({ id: received.id })).toMatchObject({ ok: true });
    expect((await roles())[outsider.id]).toBe("admin");
  });

  it("seuls le propriétaire et les administrateurs invitent ; un non-membre ne voit pas le projet", async () => {
    actAs(member);
    expect(await inviteMember(projectId, { email: "x@exemple.fr" })).toEqual({
      ok: false,
      error: "Seuls le propriétaire et les administrateurs du projet peuvent faire cela.",
    });
    actAs(outsider);
    expect(await inviteMember(projectId, { email: outsider.email })).toEqual({ ok: false, error: "Projet introuvable." });
    expect(await db.select().from(projectInvitations)).toEqual([]);
  });

  it("refuse un email invalide ou déjà membre ; même réponse qu'un compte existe ou non", async () => {
    actAs(owner);
    expect(await inviteMember(projectId, { email: "pas-un-email" })).toMatchObject({ ok: false });
    expect(await inviteMember(projectId, { email: member.email })).toEqual({ ok: false, error: "Cette personne est déjà membre du projet." });
    expect(await inviteMember(projectId, { email: "inconnu@exemple.fr" })).toMatchObject({ ok: true });
    expect(await inviteMember(projectId, { email: outsider.email })).toMatchObject({ ok: true });
  });

  it("réinviter remplace l'invitation en attente ; annuler et refuser la rendent inutilisable", async () => {
    const first = await invite(outsider.email);
    const second = await invite(outsider.email);
    actAs(owner);
    expect(await getPendingInvitations(projectId)).toHaveLength(1);

    actAs(outsider);
    expect(await acceptInvitation({ token: first })).toMatchObject({ ok: false });
    expect(await declineInvitation({ token: second })).toEqual({ ok: true, data: undefined });
    expect(await acceptInvitation({ token: second })).toMatchObject({ ok: false });

    const third = await invite(outsider.email);
    const [pending] = await getPendingInvitations(projectId);
    actAs(outsider);
    // Annuler est réservé aux administrateurs du projet : pour les autres, l'invitation est introuvable.
    expect(await revokeInvitation(pending.id)).toEqual({ ok: false, error: "Invitation introuvable, expirée ou déjà utilisée." });
    actAs(admin);
    expect(await revokeInvitation(pending.id)).toEqual({ ok: true, data: undefined });
    actAs(outsider);
    expect(await acceptInvitation({ token: third })).toMatchObject({ ok: false });
    expect((await roles())[outsider.id]).toBeUndefined();
  });

  it("une invitation expirée ne sert plus", async () => {
    const token = await invite(outsider.email);
    await db.update(projectInvitations).set({ expiresAt: new Date(Date.now() - 1000) });
    actAs(outsider);
    expect(await acceptInvitation({ token })).toMatchObject({ ok: false });
    expect(await getReceivedInvitations(outsider)).toEqual([]);
  });

  it("après la connexion, ne reprend qu'un lien d'invitation", () => {
    expect(afterLoginPath("/invitations/abc_DEF-123")).toBe("/invitations/abc_DEF-123");
    expect(afterLoginPath("/rejoindre/abc_DEF-123")).toBe("/rejoindre/abc_DEF-123");
    expect(afterLoginPath("//evil.example/invitations/x")).toBe("/");
    expect(afterLoginPath("https://evil.example")).toBe("/");
    expect(afterLoginPath("/projets")).toBe("/");
    expect(afterLoginPath(null)).toBe("/");
  });
});

describe("membres et rôles", () => {
  it("un administrateur change le rôle d'un membre, pas celui du propriétaire", async () => {
    actAs(admin);
    expect(await setMemberRole(projectId, member.id, "admin")).toEqual({ ok: true, data: undefined });
    expect(await setMemberRole(projectId, owner.id, "member")).toMatchObject({ ok: false });
    expect(await setMemberRole(projectId, member.id, "owner")).toEqual({ ok: false, error: "Rôle invalide." });
    expect(await roles()).toEqual({ [owner.id]: "owner", [admin.id]: "admin", [member.id]: "admin" });

    actAs(member);
    await setMemberRole(projectId, member.id, "member");
    actAs(outsider);
    expect(await setMemberRole(projectId, member.id, "member")).toEqual({ ok: false, error: "Projet introuvable." });
  });

  it("retirer un membre lui ôte l'accès et ses affectations aux tâches du projet", async () => {
    const [task] = await db.insert(tasks).values({ projectId, title: "Maquettes" }).returning();
    await db.insert(taskAssignees).values({ taskId: task.id, userId: member.id });

    actAs(member);
    expect(await removeMember(projectId, admin.id)).toMatchObject({ ok: false });
    actAs(admin);
    expect(await removeMember(projectId, owner.id)).toMatchObject({ ok: false });
    expect(await removeMember(projectId, member.id)).toEqual({ ok: true, data: undefined });
    expect((await roles())[member.id]).toBeUndefined();
    expect(await db.select().from(taskAssignees)).toEqual([]);
    // La tâche reste dans le projet.
    expect(await db.select().from(tasks)).toHaveLength(1);
    // Un administrateur ne retire pas un autre administrateur ; le propriétaire, si.
    await addMember(db, projectId, outsider.id, "admin");
    expect(await removeMember(projectId, outsider.id)).toEqual({ ok: false, error: "Seul le propriétaire peut retirer un administrateur." });
    actAs(owner);
    expect(await removeMember(projectId, outsider.id)).toMatchObject({ ok: true });
  });

  it("on peut quitter un projet, sauf son propriétaire", async () => {
    actAs(member);
    expect(await leaveProject(projectId)).toEqual({ ok: true, data: undefined });
    expect((await roles())[member.id]).toBeUndefined();
    actAs(owner);
    expect(await leaveProject(projectId)).toMatchObject({ ok: false });
  });

  it("transfert de propriété : un seul propriétaire, toujours", async () => {
    actAs(admin);
    expect(await transferOwnership(projectId, member.id)).toEqual({ ok: false, error: "Seul le propriétaire du projet peut faire cela." });
    actAs(owner);
    expect(await transferOwnership(projectId, outsider.id)).toEqual({ ok: false, error: "Membre introuvable." });
    expect(await transferOwnership(projectId, member.id)).toEqual({ ok: true, data: undefined });

    expect(await roles()).toEqual({ [owner.id]: "admin", [admin.id]: "admin", [member.id]: "owner" });
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.ownerId).toBe(member.id);
  });
});

describe("invitation par email : adresse vérifiée obligatoire", () => {
  it("un compte à l'email non vérifié ne voit pas l'invitation et ne peut pas l'accepter, même avec le lien", async () => {
    // Quelqu'un s'inscrit avec l'email d'un autre, qui a une invitation en attente.
    const squatter = await insertUser(db, "Usurpateur", { emailVerified: false });
    const token = await invite(squatter.email);
    const [invitation] = await db.select().from(projectInvitations).where(eq(projectInvitations.projectId, projectId));

    actAs(squatter);
    expect(await getReceivedInvitations(squatter)).toEqual([]);
    const refused = { ok: false, error: expect.stringMatching(/^Vérifiez d'abord votre adresse email/) };
    expect(await acceptInvitation({ token })).toEqual(refused);
    expect(await acceptInvitation({ id: invitation.id })).toEqual(refused);
    expect(await declineInvitation({ token })).toEqual(refused);
    expect((await roles())[squatter.id]).toBeUndefined();

    // Une fois l'adresse vérifiée, l'invitation est utilisable.
    const verified = { ...squatter, emailVerifiedAt: new Date() };
    await db.update(users).set({ emailVerifiedAt: verified.emailVerifiedAt }).where(eq(users.id, squatter.id));
    actAs(verified);
    expect(await acceptInvitation({ token })).toEqual({ ok: true, data: { projectId } });
  });
});

describe("invitation par nom d'utilisateur", () => {
  const byUsername = async (username: string, role: "admin" | "member" = "member", as = owner) => {
    actAs(as);
    return inviteByUsername(projectId, { username, role });
  };

  it("vise un compte existant par son nom exact (casse indifférente) et le prévient par email", async () => {
    expect(await byUsername(outsider.username!.toUpperCase(), "admin")).toEqual({ ok: true, data: { name: outsider.name, emailError: null } });

    const [invitation] = await db.select().from(projectInvitations).where(eq(projectInvitations.projectId, projectId));
    expect(invitation).toMatchObject({ email: null, invitedUserId: outsider.id, role: "admin", status: "pending" });

    const [[message]] = vi.mocked(sendEmail).mock.calls;
    expect(message.to).toBe(outsider.email);
    expect(message.subject).toBe("Alice Propriétaire vous invite dans « Refonte du site »");
    expect(message.text).toMatch(/http:\/\/localhost:3000\/invitations\/[A-Za-z0-9_-]{43}/);

    // Visible dans l'application, même sans vérifier l'email (c'est le compte qui est visé).
    const unverified = { ...outsider, emailVerifiedAt: null };
    expect(await getReceivedInvitations(unverified)).toMatchObject([{ projectId, role: "admin" }]);

    // Personne d'autre ne peut l'utiliser, même avec le lien de l'email.
    const token = /\/invitations\/([A-Za-z0-9_-]+)/.exec(message.text)![1];
    actAs(member);
    expect(await acceptInvitation({ token })).toMatchObject({ ok: false });

    actAs(unverified);
    expect(await acceptInvitation({ token })).toEqual({ ok: true, data: { projectId } });
    expect((await roles())[outsider.id]).toBe("admin");
  });

  it("peut être refusée", async () => {
    await byUsername(outsider.username!);
    const [invitation] = await db.select().from(projectInvitations).where(eq(projectInvitations.projectId, projectId));
    actAs(outsider);
    expect(await declineInvitation({ id: invitation.id })).toEqual({ ok: true, data: undefined });
    expect(await getReceivedInvitations(outsider)).toEqual([]);
    expect((await roles())[outsider.id]).toBeUndefined();
  });

  it("refuse un nom inconnu (pas de recherche approchée), un membre ou un non-gestionnaire", async () => {
    expect(await byUsername(outsider.username!.slice(0, -1))).toEqual({ ok: false, error: "Aucun compte avec ce nom d'utilisateur." });
    expect(await byUsername(member.username!)).toEqual({ ok: false, error: "Cette personne est déjà membre du projet." });
    expect(await byUsername(outsider.username!, "member", member)).toMatchObject({ ok: false });
    expect(await db.select().from(projectInvitations)).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("si l'email ne part pas, l'invitation reste valable et l'erreur est remontée", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, code: "unavailable" });
    const res = await byUsername(outsider.username!);
    expect(res).toEqual({ ok: true, data: { name: outsider.name, emailError: expect.stringMatching(/ne répond pas/) } });
    expect(await getReceivedInvitations(outsider)).toHaveLength(1);
  });

  it("apparaît dans les invitations en attente du projet, avec le nom d'utilisateur", async () => {
    await byUsername(outsider.username!);
    expect(await getPendingInvitations(projectId)).toMatchObject([{ email: null, username: outsider.username }]);
  });
});

describe("lien d'invitation ouvert", () => {
  const createLink = async (input: { days?: number; maxUses?: number | null } = {}, as = owner) => {
    actAs(as);
    const res = await createInviteLink(projectId, input);
    if (!res.ok) throw new Error(res.error);
    return res.data.path.split("/").pop()!;
  };
  const join = (user: User, token: string) => {
    actAs(user);
    return joinWithInviteLink(token);
  };
  const INVALID = { ok: false, error: expect.stringMatching(/^Ce lien d'invitation est invalide/) };

  it("un compte existant, déjà connecté, rejoint le projet comme membre ; l'utilisation est journalisée", async () => {
    const token = await createLink();
    expect(await join(outsider, token)).toEqual({ ok: true, data: { projectId } });
    expect((await roles())[outsider.id]).toBe("member");

    const [link] = await db.select().from(projectInviteLinks);
    expect(link).toMatchObject({ role: "member", useCount: 1, maxUses: 1, createdBy: owner.id });
    expect(await db.select().from(projectInviteLinkUses)).toMatchObject([{ linkId: link.id, userId: outsider.id }]);
  });

  it("le lien n'est jamais stocké en clair", async () => {
    const token = await createLink();
    const [link] = await db.select().from(projectInviteLinks);
    expect(link.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(link.tokenHash).not.toContain(token);
  });

  it("à usage unique : une deuxième personne est refusée", async () => {
    const token = await createLink({ maxUses: 1 });
    expect(await join(outsider, token)).toMatchObject({ ok: true });
    const other = await insertUser(db, "Nadia");
    expect(await join(other, token)).toEqual(INVALID);
    expect((await roles())[other.id]).toBeUndefined();
  });

  it("à usages multiples : jamais au-delà du maximum (compté en base, dans la même instruction que l'ajout)", async () => {
    const token = await createLink({ maxUses: 2 });
    const people = await Promise.all(["P1", "P2", "P3", "P4"].map((n) => insertUser(db, n)));
    const results = [];
    for (const p of people) results.push(await join(p, token));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const [link] = await db.select().from(projectInviteLinks);
    expect(link.useCount).toBe(2);
    expect(await db.select().from(projectInviteLinkUses)).toHaveLength(2);
  });

  it("illimité jusqu'à expiration", async () => {
    const token = await createLink({ maxUses: null });
    for (const n of ["P1", "P2", "P3"]) expect(await join(await insertUser(db, n), token)).toMatchObject({ ok: true });
  });

  it("un lien expiré ne sert plus", async () => {
    const token = await createLink({ days: 1 });
    await db.update(projectInviteLinks).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await join(outsider, token)).toEqual(INVALID);
  });

  it("un lien révoqué ne sert plus ; seuls les gestionnaires du projet révoquent", async () => {
    const token = await createLink({ maxUses: null });
    const [link] = await db.select().from(projectInviteLinks);

    actAs(outsider);
    expect(await revokeInviteLink(link.id)).toMatchObject({ ok: false, error: expect.stringMatching(/invalide/) });
    actAs(member);
    expect(await revokeInviteLink(link.id)).toMatchObject({ ok: false, error: expect.stringMatching(/Seuls le propriétaire/) });
    actAs(admin);
    expect(await revokeInviteLink(link.id)).toEqual({ ok: true, data: undefined });

    expect(await join(outsider, token)).toEqual(INVALID);
  });

  it("déjà membre : le lien mène au projet sans consommer d'utilisation", async () => {
    const token = await createLink({ maxUses: 1 });
    expect(await join(member, token)).toEqual({ ok: true, data: { projectId } });
    const [link] = await db.select().from(projectInviteLinks);
    expect(link.useCount).toBe(0);
    expect(await join(outsider, token)).toMatchObject({ ok: true });
  });

  it("exige une adresse email vérifiée", async () => {
    const token = await createLink();
    const unverified = await insertUser(db, "Nouveau", { emailVerified: false });
    expect(await join(unverified, token)).toEqual({ ok: false, error: expect.stringMatching(/^Vérifiez d'abord/) });
    expect(await db.select().from(projectInviteLinkUses)).toEqual([]);
  });

  it("seuls le propriétaire et les administrateurs en créent, toujours pour le rôle membre", async () => {
    actAs(member);
    expect(await createInviteLink(projectId, {})).toMatchObject({ ok: false });
    actAs(outsider);
    expect(await createInviteLink(projectId, {})).toMatchObject({ ok: false });
    await createLink({}, admin);
    // La base refuse tout autre rôle.
    await expect(
      db.insert(projectInviteLinks).values({ projectId, tokenHash: "x", role: "admin", expiresAt: new Date(Date.now() + 1000) }),
    ).rejects.toThrow();
  });

  it("valide la durée et le nombre d'utilisations", async () => {
    actAs(owner);
    expect(await createInviteLink(projectId, { days: 0 })).toEqual({ ok: false, error: "1 jour minimum" });
    expect(await createInviteLink(projectId, { days: 31 })).toEqual({ ok: false, error: "30 jours maximum" });
    expect(await createInviteLink(projectId, { maxUses: 0 })).toEqual({ ok: false, error: "1 utilisation minimum" });
    const [link] = (await createLink(), await db.select().from(projectInviteLinks));
    // 7 jours par défaut.
    expect(Math.round((link.expiresAt.getTime() - Date.now()) / 86_400_000)).toBe(7);
  });

  it("apparaît dans les paramètres avec son état et son journal", async () => {
    const token = await createLink({ maxUses: 2 });
    await join(outsider, token);
    expect(await getInviteLinks(projectId)).toMatchObject([
      { state: "active", useCount: 1, maxUses: 2, createdByName: "Alice Propriétaire", uses: [{ name: "Bob Extérieur" }] },
    ]);
  });
});
