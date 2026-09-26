/**
 * Comptes de bout en bout : inscription, vérification d'email, connexion (email ou nom
 * d'utilisateur), déconnexion, mot de passe oublié, limitation des tentatives.
 *
 * La vraie lib/auth est utilisée, avec un cookie simulé : un « navigateur » = un pot de cookies.
 * Les emails sont capturés (sendEmail simulé) pour y lire les liens.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { authThrottle, sessions, users } from "@/db/schema";
import { getCurrentUser, hashPassword, SESSION_COOKIE } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import { getProjectsWithStats, getReceivedInvitations } from "@/lib/queries";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import {
  changePassword,
  checkUsername,
  login,
  logout,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  setUsername,
  signup,
  verifyEmail,
} from "./auth";

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
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(),
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

/** Dernier email envoyé à `to` : sujet et premier lien du texte. */
function lastEmailTo(to: string) {
  const calls = vi.mocked(sendEmail).mock.calls.filter(([m]) => m.to === to);
  const message = calls.at(-1)?.[0];
  if (!message) throw new Error(`Aucun email envoyé à ${to}`);
  const url = /https?:\/\/\S+/.exec(message.text)?.[0] ?? "";
  return { subject: message.subject, url, path: new URL(url).pathname, search: new URL(url).search };
}

const tokenOf = (path: string) => path.split("/").pop()!;
const PASSWORD = "un-mot-de-passe-solide";

async function signUp(username: string, email: string, extra: Record<string, string> = {}) {
  return redirectOf(() => signup({}, form({ username, email, password: PASSWORD, confirm: PASSWORD, ...extra })));
}

const loginWith = (identifier: string, password = PASSWORD) => login({}, form({ identifier, password }));

beforeEach(async () => {
  await resetDb(db);
  await db.delete(authThrottle);
  web.jar.clear();
  web.ip = "203.0.113.1";
  vi.mocked(sendEmail).mockResolvedValue({ ok: true });
});

describe("inscription", () => {
  it("crée le compte, ouvre une session et envoie un lien de vérification", async () => {
    expect(await signUp("Nadia_R", "Nadia@Exemple.fr")).toBe("/verification-email");

    const [user] = await db.select().from(users).where(eq(users.email, "nadia@exemple.fr"));
    expect(user).toMatchObject({ username: "Nadia_R", name: "Nadia_R", emailVerifiedAt: null });
    expect(user.usernameConfirmedAt).not.toBeNull();
    // Même coût bcrypt que les comptes existants.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect((await getCurrentUser())?.id).toBe(user.id);

    const email = lastEmailTo("nadia@exemple.fr");
    expect(email.subject).toBe("Confirmez votre adresse email");
    expect(email.path).toMatch(/^\/verification-email\/[A-Za-z0-9_-]{43}$/);
  });

  it("valide le nom d'utilisateur, l'email et le mot de passe", async () => {
    const res = await signup({}, form({ username: "ab", email: "pas-un-email", password: "court", confirm: "autre" }));
    expect(res.fieldErrors).toMatchObject({
      username: "3 caractères minimum",
      email: "Email invalide",
      password: "10 caractères minimum",
    });
    expect((await signup({}, form({ username: "admin", email: "a@b.fr", password: PASSWORD, confirm: PASSWORD }))).fieldErrors).toMatchObject({
      username: "Ce nom d'utilisateur est réservé",
    });
    expect((await signup({}, form({ username: "nadia r", email: "a@b.fr", password: PASSWORD, confirm: PASSWORD }))).fieldErrors).toMatchObject({
      username: "Lettres, chiffres, _ et - uniquement",
    });
    expect((await signup({}, form({ username: "nadia", email: "a@b.fr", password: PASSWORD, confirm: "different-mais-long" }))).fieldErrors).toMatchObject({
      confirm: "Les deux mots de passe ne correspondent pas",
    });
    expect(await db.select().from(users)).toEqual([]);
  });

  it("refuse un nom d'utilisateur ou un email déjà pris, sans tenir compte de la casse", async () => {
    await signUp("nadia", "nadia@exemple.fr");
    web.jar.clear();
    expect((await signup({}, form({ username: "NADIA", email: "autre@exemple.fr", password: PASSWORD, confirm: PASSWORD }))).fieldErrors).toMatchObject({
      username: "Ce nom d'utilisateur est déjà pris.",
    });
    expect((await signup({}, form({ username: "nadia2", email: "NADIA@exemple.fr", password: PASSWORD, confirm: PASSWORD }))).fieldErrors?.email).toMatch(
      /Un compte existe déjà/,
    );
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("vérifie la disponibilité d'un nom d'utilisateur en temps réel", async () => {
    await insertUser(db, "Camille", { username: "camille" });
    expect(await checkUsername("Camille")).toEqual({ available: false, error: "Ce nom d'utilisateur est déjà pris" });
    expect(await checkUsername("camille-2")).toEqual({ available: true });
    expect(await checkUsername("api")).toEqual({ available: false, error: "Ce nom d'utilisateur est réservé" });
  });

  it("si l'email ne part pas, le compte est créé et l'erreur est affichée clairement", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, code: "quota" });
    expect(await signUp("nadia", "nadia@exemple.fr")).toBe("/verification-email?envoi=quota");
    expect(await db.select().from(users)).toHaveLength(1);

    // Le renvoi remonte l'erreur à l'utilisateur.
    expect(await resendVerification()).toEqual({ ok: false, error: expect.stringMatching(/limite/) });
  });

  it("un nouveau compte ne voit aucun projet tant qu'il n'est pas invité", async () => {
    const owner = await insertUser(db, "Alice");
    await insertProject(db, "Projet d'Alice", owner.id);
    await signUp("nadia", "nadia@exemple.fr");
    const me = (await getCurrentUser())!;
    expect(await getProjectsWithStats(me.id, { today: "2026-09-26" })).toEqual([]);
  });

  it("garde le lien d'invitation à reprendre après l'inscription", async () => {
    expect(await signUp("nadia", "nadia@exemple.fr", { suite: "/rejoindre/abc123" })).toBe("/verification-email?suite=%2Frejoindre%2Fabc123");
    expect(lastEmailTo("nadia@exemple.fr").search).toBe("?suite=%2Frejoindre%2Fabc123");
    // Jamais une adresse externe.
    web.jar.clear();
    expect(await signUp("lea", "lea@exemple.fr", { suite: "https://evil.example/x" })).toBe("/verification-email");
  });
});

describe("vérification de l'email", () => {
  it("le lien vérifie l'adresse, une seule fois", async () => {
    await signUp("nadia", "nadia@exemple.fr");
    const token = tokenOf(lastEmailTo("nadia@exemple.fr").path);

    expect(await verifyEmail(token)).toEqual({ ok: true, data: undefined });
    expect((await getCurrentUser())?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await verifyEmail(token)).toMatchObject({ ok: false });
  });

  it("un lien expiré ou remplacé par un nouvel envoi ne fonctionne plus", async () => {
    await signUp("nadia", "nadia@exemple.fr");
    const first = tokenOf(lastEmailTo("nadia@exemple.fr").path);
    expect(await resendVerification()).toEqual({ ok: true, data: undefined });
    const second = tokenOf(lastEmailTo("nadia@exemple.fr").path);
    expect(second).not.toBe(first);
    expect(await verifyEmail(first)).toMatchObject({ ok: false });

    await db.execute(`update email_verification_tokens set expires_at = now() - interval '1 minute'` as never);
    expect(await verifyEmail(second)).toMatchObject({ ok: false });
    expect((await getCurrentUser())?.emailVerifiedAt).toBeNull();
  });

  it("le jeton n'est stocké que haché", async () => {
    await signUp("nadia", "nadia@exemple.fr");
    const token = tokenOf(lastEmailTo("nadia@exemple.fr").path);
    const rows = (await db.execute<{ token_hash: string }>(`select token_hash from email_verification_tokens` as never)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toContain(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("connexion et déconnexion", () => {
  beforeEach(async () => {
    await signUp("nadia", "nadia@exemple.fr");
    web.jar.clear();
  });

  it("par email ou par nom d'utilisateur, sans tenir compte de la casse", async () => {
    expect(await redirectOf(() => loginWith("NADIA@exemple.fr"))).toBe("/");
    expect((await getCurrentUser())?.username).toBe("nadia");
    web.jar.clear();
    expect(await redirectOf(() => loginWith("Nadia"))).toBe("/");
    expect((await getCurrentUser())?.email).toBe("nadia@exemple.fr");
  });

  it("même message générique que le compte existe ou non", async () => {
    expect(await loginWith("nadia", "mauvais-mot-de-passe")).toEqual({ error: "Identifiants incorrects.", identifier: "nadia" });
    expect(await loginWith("personne", PASSWORD)).toEqual({ error: "Identifiants incorrects.", identifier: "personne" });
    expect(await loginWith("personne@exemple.fr", PASSWORD)).toMatchObject({ error: "Identifiants incorrects." });
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("déconnexion : la session est supprimée en base et le cookie retiré", async () => {
    // L'inscription a déjà ouvert une session (un autre appareil) : seule celle-ci est fermée.
    await redirectOf(() => loginWith("nadia"));
    expect(await db.select().from(sessions)).toHaveLength(2);
    expect(await redirectOf(() => logout())).toBe("/connexion");
    expect(web.jar.has(SESSION_COOKIE)).toBe(false);
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await getCurrentUser()).toBeNull();
  });

  it("reprend le lien d'invitation après la connexion, jamais une adresse externe", async () => {
    expect(await redirectOf(() => login({}, form({ identifier: "nadia", password: PASSWORD, suite: "/invitations/abc" })))).toBe("/invitations/abc");
    web.jar.clear();
    expect(await redirectOf(() => login({}, form({ identifier: "nadia", password: PASSWORD, suite: "//evil.example" })))).toBe("/");
  });
});

describe("limitation des tentatives", () => {
  beforeEach(async () => {
    await signUp("nadia", "nadia@exemple.fr");
    web.jar.clear();
  });

  it("verrouille le compte après 5 échecs, même avec le bon mot de passe, puis de plus en plus longtemps", async () => {
    for (let i = 0; i < 5; i++) expect(await loginWith("nadia", "faux-mot-de-passe")).toMatchObject({ error: "Identifiants incorrects." });
    // 6e échec : verrouillé 30 s.
    expect(await loginWith("nadia@exemple.fr", "faux-mot-de-passe")).toMatchObject({ error: "Identifiants incorrects." });
    expect(await loginWith("nadia", PASSWORD)).toEqual({ error: "Trop de tentatives. Réessayez dans 30 secondes.", identifier: "nadia" });
    // Par l'email aussi : même compteur que le nom d'utilisateur.
    expect((await loginWith("nadia@exemple.fr", PASSWORD)).error).toMatch(/^Trop de tentatives/);
    // Depuis une autre adresse IP aussi : c'est le compte qui est verrouillé.
    web.ip = "198.51.100.7";
    expect((await loginWith("nadia", PASSWORD)).error).toMatch(/^Trop de tentatives/);

    // Fin du verrouillage : un nouvel échec double la durée.
    await db.execute(`update auth_throttle set locked_until = now() - interval '1 second'` as never);
    expect(await loginWith("nadia", "faux-mot-de-passe")).toMatchObject({ error: "Identifiants incorrects." });
    expect(await loginWith("nadia", PASSWORD)).toMatchObject({ error: "Trop de tentatives. Réessayez dans 1 minute." });

    // Après le verrouillage, le bon mot de passe passe et remet le compteur à zéro.
    await db.execute(`update auth_throttle set locked_until = now() - interval '1 second'` as never);
    expect(await redirectOf(() => loginWith("nadia"))).toBe("/");
    const [row] = await db.select().from(authThrottle).where(eq(authThrottle.key, `login-account:${(await getCurrentUser())!.id}`));
    expect(row).toBeUndefined();
  });

  it("un identifiant inconnu est verrouillé de la même façon (rien n'est révélé)", async () => {
    for (let i = 0; i < 6; i++) await loginWith("inconnu", "x");
    expect((await loginWith("inconnu", "x")).error).toBe("Trop de tentatives. Réessayez dans 30 secondes.");
  });

  it("verrouille une adresse IP qui essaie beaucoup de comptes", async () => {
    for (let i = 0; i < 21; i++) await loginWith(`inconnu${i}`, "x");
    expect((await loginWith("nadia", PASSWORD)).error).toMatch(/^Trop de tentatives/);
    web.ip = "198.51.100.7";
    expect(await redirectOf(() => loginWith("nadia"))).toBe("/");
  });
});

describe("mot de passe oublié", () => {
  let nadiaId: string;

  beforeEach(async () => {
    await signUp("nadia", "nadia@exemple.fr");
    nadiaId = (await getCurrentUser())!.id;
    vi.mocked(sendEmail).mockClear();
  });

  it("même réponse que le compte existe ou non ; email seulement s'il existe", async () => {
    expect(await requestPasswordReset({}, form({ email: "Nadia@exemple.fr" }))).toEqual({ done: true, email: "nadia@exemple.fr" });
    expect(await requestPasswordReset({}, form({ email: "personne@exemple.fr" }))).toEqual({ done: true, email: "personne@exemple.fr" });
    expect(vi.mocked(sendEmail).mock.calls.map(([m]) => m.to)).toEqual(["nadia@exemple.fr"]);
    expect(lastEmailTo("nadia@exemple.fr").path).toMatch(/^\/reinitialisation\/[A-Za-z0-9_-]{43}$/);
  });

  it("la réponse reste la même si l'envoi échoue (l'échec est journalisé)", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, code: "unavailable" });
    expect(await requestPasswordReset({}, form({ email: "nadia@exemple.fr" }))).toEqual({ done: true, email: "nadia@exemple.fr" });
  });

  it("change le mot de passe et ferme toutes les sessions ; lien à usage unique", async () => {
    // Une deuxième session, sur un autre appareil.
    const otherDevice = new Map(web.jar);
    web.jar.clear();
    await redirectOf(() => loginWith("nadia"));
    expect(await db.select().from(sessions).where(eq(sessions.userId, nadiaId))).toHaveLength(2);

    await requestPasswordReset({}, form({ email: "nadia@exemple.fr" }));
    const token = tokenOf(lastEmailTo("nadia@exemple.fr").path);
    const reset = (password: string, confirm = password) => resetPassword({}, form({ token, password, confirm }));

    expect((await reset("court")).fieldErrors).toMatchObject({ password: "10 caractères minimum" });
    expect(await redirectOf(() => reset("nouveau-mot-de-passe"))).toBe("/connexion?reinitialise=1");

    expect(await db.select().from(sessions).where(eq(sessions.userId, nadiaId))).toHaveLength(0);
    expect(await getCurrentUser()).toBeNull();
    web.jar = otherDevice;
    expect(await getCurrentUser()).toBeNull();

    expect(await loginWith("nadia", PASSWORD)).toMatchObject({ error: "Identifiants incorrects." });
    web.jar.clear();
    expect(await redirectOf(() => loginWith("nadia", "nouveau-mot-de-passe"))).toBe("/");

    // Déjà utilisé.
    expect((await reset("encore-un-autre-mdp")).error).toMatch(/invalide, a expiré ou a déjà servi/);
  });

  it("un lien expiré (1 h) ou remplacé ne fonctionne plus", async () => {
    await requestPasswordReset({}, form({ email: "nadia@exemple.fr" }));
    const first = tokenOf(lastEmailTo("nadia@exemple.fr").path);
    await requestPasswordReset({}, form({ email: "nadia@exemple.fr" }));
    const second = tokenOf(lastEmailTo("nadia@exemple.fr").path);
    const reset = (token: string) => resetPassword({}, form({ token, password: "nouveau-mot-de-passe", confirm: "nouveau-mot-de-passe" }));

    expect((await reset(first)).error).toMatch(/invalide/);
    await db.execute(`update password_reset_tokens set expires_at = now() - interval '1 second'` as never);
    expect((await reset(second)).error).toMatch(/invalide/);
  });

  it("limite les demandes par adresse IP (10 par heure, inscription comprise)", async () => {
    for (let i = 0; i < 9; i++) expect(await requestPasswordReset({}, form({ email: `x${i}@exemple.fr` }))).toMatchObject({ done: true });
    expect((await requestPasswordReset({}, form({ email: "nadia@exemple.fr" }))).error).toMatch(/^Trop de tentatives/);
  });
});

describe("comptes existants (migrés)", () => {
  it("se connectent avec leur email et leur mot de passe d'origine et retrouvent leurs projets", async () => {
    // Compte d'avant les comptes : créé par un administrateur, hash bcrypt existant.
    const hugo = await insertUser(db, "Hugo", { passwordHash: await hashPassword("demo1234"), username: "hugo" });
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

  it("les sessions ouvertes avant la migration restent valables", async () => {
    const hugo = await insertUser(db, "Hugo");
    const { createHash } = await import("node:crypto");
    const token = "jeton-de-session-existant";
    await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: hugo.id, expiresAt: new Date(Date.now() + 86_400_000) });
    web.jar.set(SESSION_COOKIE, token);
    expect((await getCurrentUser())?.id).toBe(hugo.id);
  });

  it("peuvent confirmer ou changer le nom d'utilisateur proposé", async () => {
    const hugo = await insertUser(db, "Hugo", { passwordHash: await hashPassword(PASSWORD), username: "hugo" });
    await db.update(users).set({ usernameConfirmedAt: null }).where(eq(users.id, hugo.id));
    await insertUser(db, "Léa", { username: "lea" });
    await redirectOf(() => loginWith("hugo"));
    expect((await getCurrentUser())?.usernameConfirmedAt).toBeNull();

    expect(await setUsername("LEA")).toEqual({ ok: false, error: "Ce nom d'utilisateur est déjà pris." });
    expect(await setUsername("root")).toEqual({ ok: false, error: "Ce nom d'utilisateur est réservé" });
    expect(await setUsername("Hugo_D")).toEqual({ ok: true, data: { username: "Hugo_D" } });
    expect(await getCurrentUser()).toMatchObject({ username: "Hugo_D", usernameConfirmedAt: expect.any(Date) });
  });

  it("changer son mot de passe exige désormais 10 caractères", async () => {
    await insertUser(db, "Hugo", { passwordHash: await hashPassword("demo1234"), username: "hugo" });
    await redirectOf(() => loginWith("hugo", "demo1234"));
    expect(await changePassword("demo1234", "court123")).toEqual({ ok: false, error: "10 caractères minimum" });
    expect(await changePassword("demo1234", "beaucoup-plus-long")).toEqual({ ok: true, data: undefined });
  });
});

describe("invitations et email non vérifié", () => {
  it("les invitations par email restent cachées tant que l'email n'est pas vérifié", async () => {
    const owner = await insertUser(db, "Alice");
    const project = await insertProject(db, "Site", owner.id);
    await db.execute(
      `insert into project_invitations (project_id, email, role, token_hash, expires_at)
       values ('${project.id}', 'nadia@exemple.fr', 'member', 'hash', now() + interval '1 day')` as never,
    );
    await signUp("nadia", "nadia@exemple.fr");
    expect(await getReceivedInvitations((await getCurrentUser())!)).toEqual([]);

    await verifyEmail(tokenOf(lastEmailTo("nadia@exemple.fr").path));
    expect(await getReceivedInvitations((await getCurrentUser())!)).toMatchObject([{ projectId: project.id }]);
  });
});

describe("lien d'invitation ouvert, sans compte", () => {
  it("inscription, vérification de l'email, puis entrée dans le projet comme membre", async () => {
    const { projectInviteLinks, projectMembers } = await import("@/db/schema");
    const { hashInvitationToken } = await import("@/lib/invitations");
    const { joinWithInviteLink } = await import("./project-members");
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

    // Le lien est repris tout au long de l'inscription et de la vérification.
    expect(await signUp("nadia", "nadia@exemple.fr", { suite: `/rejoindre/${token}` })).toBe(`/verification-email?suite=%2Frejoindre%2F${token}`);
    expect(await joinWithInviteLink(token)).toMatchObject({ ok: false, error: expect.stringMatching(/^Vérifiez d'abord/) });

    const email = lastEmailTo("nadia@exemple.fr");
    expect(email.search).toBe(`?suite=%2Frejoindre%2F${token}`);
    expect(await verifyEmail(tokenOf(email.path))).toMatchObject({ ok: true });

    expect(await joinWithInviteLink(token)).toEqual({ ok: true, data: { projectId: project.id } });
    const me = (await getCurrentUser())!;
    const [membership] = await db.select().from(projectMembers).where(eq(projectMembers.userId, me.id));
    expect(membership).toMatchObject({ projectId: project.id, role: "member" });
    expect((await getProjectsWithStats(me.id, { today: "2026-09-26" })).map((p) => p.id)).toEqual([project.id]);
  });
});
