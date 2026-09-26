import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectInvitations, projectMembers, projects, taskAssignees, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { afterLoginPath } from "@/lib/invitations";
import { getPendingInvitations, getReceivedInvitations } from "@/lib/queries";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import {
  acceptInvitation,
  declineInvitation,
  inviteMember,
  leaveProject,
  removeMember,
  revokeInvitation,
  setMemberRole,
  transferOwnership,
} from "./project-members";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
