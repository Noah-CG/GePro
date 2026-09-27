/**
 * Comptes de bout en bout : inscription (prénom, nom, sans vérification d'email), connexion par
 * email, déconnexion, limitation des tentatives, comptes existants.
 *
 * La vraie lib/auth est utilisée, avec un cookie simulé : un « navigateur » = un pot de cookies.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { authThrottle, projectInviteLinks, projectMembers, sessions, users } from "@/db/schema";
import { getCurrentUser, hashPassword, SESSION_COOKIE } from "@/lib/auth";
import { hashInvitationToken } from "@/lib/invitations";
import { getProjectsWithStats } from "@/lib/queries";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import { changePassword, login, logout, signup } from "./auth";
import { joinWithInviteLink } from "./project-members";

const web = vi.hoisted(() => ({ jar: new Map<string, string>(), ip: "203.0.113.1" }));

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (web.jar.has(name) ? { name, value: web.jar.get(name)! } : undefined),
    set: (name: string, value: string) => web.jar.set(name, value),
    delete: (name: string) => web.jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": web.ip }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.setConfig({ testTimeout: 30_000 });

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

/** Lance une action qui se termine par redirect() et renvoie l'adresse de destination. */
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    const result = await run();
    throw new Error(`Pas de redirection : ${JSON.stringify(result)}`);
  } catch (err) {
    const match = /^NEXT_REDIRECT (.+)$/.exec((err as Error).message);
    if (!match) throw err;
    return match[1];
  }
}

const PASSWORD = "un-mot-de-passe-solide";
const signupForm = (email: string, extra: Record<string, string> = {}) =>
  form({ firstName: "Nadia", lastName: "Rahmani", email, password: PASSWORD, confirm: PASSWORD, ...extra });
const signUp = (email: string, extra: Record<string, string> = {}) => redirectOf(() => signup({}, signupForm(email, extra)));
const loginWith = (email: string, password = PASSWORD) => login({}, form({ email, password }));

beforeEach(async () => {
  await resetDb(db);
  await db.delete(authThrottle);
  web.jar.clear();
  web.ip = "203.0.113.1";
});

describe("inscription", () => {
  it("crée le compte, utilisable tout de suite : session ouverte, direction l'accueil", async () => {
    expect(await signUp("Nadia@Exemple.fr")).toBe("/");

    const [user] = await db.select().from(users).where(eq(users.email, "nadia@exemple.fr"));
    expect(user).toMatchObject({ firstName: "Nadia", lastName: "Rahmani", name: "Nadia Rahmani" });
    // Même coût bcrypt que les comptes existants.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect((await getCurrentUser())?.id).toBe(user.id);
  });

  it("stocke prénom et nom séparément, espaces superflus retirés ; les deux sont obligatoires", async () => {
    expect(await signUp("jp@exemple.fr", { firstName: "  Jean   Pierre ", lastName: " de  La Fontaine " })).toBe("/");
    const [user] = await db.select().from(users).where(eq(users.email, "jp@exemple.fr"));
    expect(user).toMatchObject({ firstName: "Jean Pierre", lastName: "de La Fontaine", name: "Jean Pierre de La Fontaine" });
    expect(await getCurrentUser()).toMatchObject({ firstName: "Jean Pierre", lastName: "de La Fontaine", name: "Jean Pierre de La Fontaine" });

    web.jar.clear();
    const res = await signup({}, signupForm("autre@exemple.fr", { firstName: "  ", lastName: "" }));
    expect(res.fieldErrors).toMatchObject({ firstName: "Le prénom est obligatoire", lastName: "Le nom est obligatoire" });
    expect(res.values).toEqual({ firstName: "", lastName: "", email: "autre@exemple.fr" });
    expect((await signup({}, signupForm("autre@exemple.fr", { firstName: "x".repeat(51) }))).fieldErrors).toMatchObject({
      firstName: "50 caractères maximum",
    });
  });

  it("valide l'email et le mot de passe", async () => {
    const res = await signup({}, form({ firstName: "Nadia", lastName: "Rahmani", email: "pas-un-email", password: "court", confirm: "autre" }));
    expect(res.fieldErrors).toMatchObject({ email: "Email invalide", password: "10 caractères minimum" });
    expect((await signup({}, signupForm("a@b.fr", { confirm: "different-mais-long" }))).fieldErrors).toMatchObject({
      confirm: "Les deux mots de passe ne correspondent pas",
    });
    expect(await db.select().from(users)).toEqual([]);
  });

  it("refuse un email déjà pris, sans tenir compte de la casse", async () => {
    await signUp("nadia@exemple.fr");
    web.jar.clear();
    expect((await signup({}, signupForm("NADIA@exemple.fr"))).fieldErrors?.email).toMatch(/Un compte existe déjà/);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("limite les inscriptions par adresse IP (10 par heure)", async () => {
    for (let i = 0; i < 10; i++) {
      web.jar.clear();
      expect(await signUp(`m${i}@exemple.fr`)).toBe("/");
    }
    expect((await signup({}, signupForm("m10@exemple.fr"))).error).toMatch(/^Trop de tentatives/);
  });

  it("un nouveau compte ne voit aucun projet tant qu'il n'est pas invité", async () => {
    const owner = await insertUser(db, "Alice");
    await insertProject(db, "Projet d'Alice", owner.id);
    await signUp("nadia@exemple.fr");
    const me = (await getCurrentUser())!;
    expect(await getProjectsWithStats(me.id, { today: "2026-09-26" })).toEqual([]);
  });

  it("reprend le lien d'invitation après l'inscription, jamais une adresse externe", async () => {
    expect(await signUp("nadia@exemple.fr", { suite: "/rejoindre/abc123" })).toBe("/rejoindre/abc123");
    web.jar.clear();
    expect(await signUp("lea@exemple.fr", { suite: "https://evil.example/x" })).toBe("/");
  });
});

describe("connexion et déconnexion", () => {
  beforeEach(async () => {
    await signUp("nadia@exemple.fr");
    web.jar.clear();
  });

  it("par email, sans tenir compte de la casse", async () => {
    expect(await redirectOf(() => loginWith("NADIA@exemple.fr"))).toBe("/");
    expect((await getCurrentUser())?.email).toBe("nadia@exemple.fr");
  });

  it("pas de connexion par nom (ni prénom-nom) : seul l'email identifie le compte", async () => {
    expect(await loginWith("nadia-rahmani")).toEqual({ error: "Identifiants incorrects.", email: "nadia-rahmani" });
    expect(await loginWith("Nadia Rahmani")).toMatchObject({ error: "Identifiants incorrects." });
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("même message générique que le compte existe ou non", async () => {
    expect(await loginWith("nadia@exemple.fr", "mauvais-mot-de-passe")).toEqual({ error: "Identifiants incorrects.", email: "nadia@exemple.fr" });
    expect(await loginWith("personne@exemple.fr", PASSWORD)).toEqual({ error: "Identifiants incorrects.", email: "personne@exemple.fr" });
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("déconnexion : la session est supprimée en base et le cookie retiré", async () => {
    // L'inscription a déjà ouvert une session (un autre appareil) : seule celle-ci est fermée.
    await redirectOf(() => loginWith("nadia@exemple.fr"));
    expect(await db.select().from(sessions)).toHaveLength(2);
    expect(await redirectOf(() => logout())).toBe("/connexion");
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await getCurrentUser()).toBeNull();
  });

  it("reprend le lien d'invitation après la connexion, jamais une adresse externe", async () => {
    const with_ = (suite: string) => login({}, form({ email: "nadia@exemple.fr", password: PASSWORD, suite }));
    expect(await redirectOf(() => with_("/invitations/abc"))).toBe("/invitations/abc");
    web.jar.clear();
    expect(await redirectOf(() => with_("//evil.example"))).toBe("/");
  });
});

describe("limitation des tentatives de connexion", () => {
  const NADIA = "nadia@exemple.fr";

  beforeEach(async () => {
    await signUp(NADIA);
    web.jar.clear();
  });

  it("verrouille le compte après 5 échecs, même avec le bon mot de passe, puis de plus en plus longtemps", async () => {
    for (let i = 0; i < 5; i++) expect(await loginWith(NADIA, "faux-mot-de-passe")).toMatchObject({ error: "Identifiants incorrects." });
    // 6e échec : verrouillé 30 s.
    expect(await loginWith("Nadia@Exemple.fr", "faux-mot-de-passe")).toMatchObject({ error: "Identifiants incorrects." });
    expect(await loginWith(NADIA, PASSWORD)).toEqual({ error: "Trop de tentatives. Réessayez dans 30 secondes.", email: NADIA });
    // Depuis une autre adresse IP aussi : c'est le compte qui est verrouillé.
    web.ip = "198.51.100.7";
    expect((await loginWith(NADIA, PASSWORD)).error).toMatch(/^Trop de tentatives/);

    // Fin du verrouillage : un nouvel échec double la durée.
    await db.update(authThrottle).set({ lockedUntil: new Date(Date.now() - 1000) });
    expect(await loginWith(NADIA, "faux-mot-de-passe")).toMatchObject({ error: "Identifiants incorrects." });
    expect(await loginWith(NADIA, PASSWORD)).toMatchObject({ error: "Trop de tentatives. Réessayez dans 1 minute." });

    // Après le verrouillage, le bon mot de passe passe et remet le compteur à zéro.
    await db.update(authThrottle).set({ lockedUntil: new Date(Date.now() - 1000) });
    expect(await redirectOf(() => loginWith(NADIA))).toBe("/");
    const [row] = await db.select().from(authThrottle).where(eq(authThrottle.key, `login-account:${(await getCurrentUser())!.id}`));
    expect(row).toBeUndefined();
  });

  it("un email inconnu est verrouillé de la même façon (rien n'est révélé)", async () => {
    for (let i = 0; i < 6; i++) await loginWith("inconnu@exemple.fr", "x");
    expect((await loginWith("inconnu@exemple.fr", "x")).error).toBe("Trop de tentatives. Réessayez dans 30 secondes.");
  });

  it("verrouille une adresse IP qui essaie beaucoup de comptes", async () => {
    for (let i = 0; i < 21; i++) await loginWith(`inconnu${i}@exemple.fr`, "x");
    expect((await loginWith(NADIA, PASSWORD)).error).toMatch(/^Trop de tentatives/);
    web.ip = "198.51.100.7";
    expect(await redirectOf(() => loginWith(NADIA))).toBe("/");
  });
});

describe("comptes existants (migrés)", () => {
  it("se connectent avec leur email et leur mot de passe d'origine et retrouvent leurs projets", async () => {
    // Compte d'avant les comptes : créé par un administrateur, hash bcrypt existant.
    const hugo = await insertUser(db, "Hugo", { passwordHash: await hashPassword("demo1234") });
    const project = await insertProject(db, "Site", hugo.id);
    const other = await insertProject(db, "Appli");
    await addMember(db, other.id, hugo.id);

    // Mot de passe de 8 caractères : toujours accepté à la connexion.
    expect(await redirectOf(() => loginWith(hugo.email, "demo1234"))).toBe("/");
    const me = (await getCurrentUser())!;
    expect(me.id).toBe(hugo.id);
    const projects = await getProjectsWithStats(me.id, { today: "2026-09-26" });
    expect(projects.map((p) => p.id).sort()).toEqual([project.id, other.id].sort());
  });

  it("affichent le prénom et le nom déduits de l'ancien champ name", async () => {
    // insertUser découpe le nom comme la migration 0013.
    const marie = await insertUser(db, "Marie-Charlotte de La Rochefoucauld", { passwordHash: await hashPassword(PASSWORD) });
    const jo = await insertUser(db, "Jo", { passwordHash: await hashPassword(PASSWORD) });
    expect(marie).toMatchObject({ firstName: "Marie-Charlotte", lastName: "de La Rochefoucauld", name: "Marie-Charlotte de La Rochefoucauld" });
    expect(jo).toMatchObject({ firstName: "Jo", lastName: "", name: "Jo" });

    await redirectOf(() => loginWith(marie.email));
    expect(await getCurrentUser()).toMatchObject({ firstName: "Marie-Charlotte", lastName: "de La Rochefoucauld", name: "Marie-Charlotte de La Rochefoucauld" });
  });

  it("les sessions ouvertes avant la migration restent valables", async () => {
    const hugo = await insertUser(db, "Hugo");
    const token = "jeton-de-session-existant";
    await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: hugo.id, expiresAt: new Date(Date.now() + 86_400_000) });
    web.jar.set(SESSION_COOKIE, token);
    expect((await getCurrentUser())?.id).toBe(hugo.id);
  });

  it("changer son mot de passe exige désormais 10 caractères", async () => {
    const hugo = await insertUser(db, "Hugo", { passwordHash: await hashPassword("demo1234") });
    await redirectOf(() => loginWith(hugo.email, "demo1234"));
    expect(await changePassword("demo1234", "court123")).toEqual({ ok: false, error: "10 caractères minimum" });
    expect(await changePassword("demo1234", "beaucoup-plus-long")).toEqual({ ok: true, data: undefined });
  });
});

describe("lien d'invitation ouvert, sans compte", () => {
  it("inscription, puis entrée dans le projet comme membre, sans étape de vérification", async () => {
    const owner = await insertUser(db, "Alice");
    const project = await insertProject(db, "Site", owner.id);
    const token = "lien-ouvert-de-test-0123456789";
    await db.insert(projectInviteLinks).values({
      projectId: project.id,
      tokenHash: hashInvitationToken(token),
      maxUses: 1,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: owner.id,
    });

    // Le lien est repris après l'inscription.
    expect(await signUp("nadia@exemple.fr", { suite: `/rejoindre/${token}` })).toBe(`/rejoindre/${token}`);
    expect(await joinWithInviteLink(token)).toEqual({ ok: true, data: { projectId: project.id } });

    const me = (await getCurrentUser())!;
    const [membership] = await db.select().from(projectMembers).where(eq(projectMembers.userId, me.id));
    expect(membership).toMatchObject({ projectId: project.id, role: "member" });
    expect((await getProjectsWithStats(me.id, { today: "2026-09-26" })).map((p) => p.id)).toEqual([project.id]);
  });
});
