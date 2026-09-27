"use server";

/**
 * Comptes : connexion (email ou nom d'utilisateur), inscription, vérification de l'email, mot de
 * passe oublié, nom d'utilisateur.
 *
 * - Les messages d'échec de connexion et de mot de passe oublié ne révèlent pas quels comptes
 *   existent. Les tentatives sont limitées par IP et par compte (lib/throttle.ts).
 * - Tous les jetons envoyés par email sont à usage unique, stockés hachés, avec une expiration.
 * - Les sessions gardent leur format d'origine (lib/auth.ts).
 */
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { emailVerificationTokens, passwordResetTokens, sessions, users } from "@/db/schema";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { isUniqueViolation } from "@/lib/db-errors";
import { appUrl, emailErrorMessage, isEmailEnabled, passwordResetEmail, RESET_BY_ADMIN, sendEmail, verificationEmail, type SendResult } from "@/lib/email";
import { afterLoginPath, suiteQuery } from "@/lib/invitations";
import {
  EMAIL_VERIFICATION_HOURS,
  hashToken,
  isTokenShaped,
  issueToken,
  PASSWORD_RESET_HOURS,
} from "@/lib/one-time-tokens";
import { verifyAgainstDummy } from "@/lib/password";
import {
  clearFailures,
  clientIp,
  EMAIL_ACTIONS_IP,
  formatWait,
  LOGIN_ACCOUNT,
  LOGIN_IP,
  lockedFor,
  recordFailure,
  USERNAME_CHECK_IP,
} from "@/lib/throttle";
import { usernameFormatError } from "@/lib/usernames";
import { emailInput, firstError, password as passwordSchema, resetPasswordInput, signupInput, usernameInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const tooMany = (seconds: number) => `Trop de tentatives. Réessayez dans ${formatWait(seconds)}.`;
const BAD_CREDENTIALS = "Identifiants incorrects.";

/** Compte désigné par un email (contient @) ou un nom d'utilisateur, sans tenir compte de la casse. */
async function findByIdentifier(identifier: string) {
  const column = identifier.includes("@") ? users.email : users.username;
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${column}) = ${identifier.toLowerCase()}`)
    .limit(1);
  return user ?? null;
}

// --- Connexion ----------------------------------------------------------------

export type LoginState = { error?: string; identifier?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const identifier = String(form.get("identifier") ?? "").trim().slice(0, 254);
  const password = String(form.get("password") ?? "");
  if (!identifier || !password) return { error: "Renseignez votre identifiant et votre mot de passe.", identifier };

  const user = await findByIdentifier(identifier);
  const ipKey = `login-ip:${await clientIp()}`;
  // Un compte existant est compté par son id (email et nom d'utilisateur partagent le compteur) ;
  // un identifiant inconnu l'est aussi, pour que la réponse soit la même.
  const accountKey = `login-account:${user?.id ?? identifier.toLowerCase()}`;

  const wait = await lockedFor([ipKey, accountKey]);
  if (wait > 0) return { error: tooMany(wait), identifier };

  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!user || !valid) {
    await recordFailure(accountKey, LOGIN_ACCOUNT);
    await recordFailure(ipKey, LOGIN_IP);
    return { error: BAD_CREDENTIALS, identifier };
  }

  // Le compteur de l'IP n'est pas remis à zéro : se connecter à son propre compte ne doit pas
  // permettre d'enchaîner les essais sur ceux des autres.
  await clearFailures([accountKey]);
  await createSession(user.id);
  redirect(afterLoginPath(form.get("suite")));
}

export async function logout() {
  await destroySession();
  redirect("/connexion");
}

export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    return fail("Mot de passe actuel incorrect.");
  }
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data) }).where(eq(users.id, me.id));
  return ok(undefined);
}

// --- Inscription et vérification de l'email ------------------------------------

/** Compte une action envoyant un email (par IP) ; renvoie un message si la limite est atteinte. */
async function emailActionLimit(): Promise<string | null> {
  const key = `email-ip:${await clientIp()}`;
  const wait = (await lockedFor([key])) || (await recordFailure(key, EMAIL_ACTIONS_IP));
  return wait > 0 ? tooMany(wait) : null;
}

/** Envoie le lien de vérification de l'adresse de `user`. `suite` : lien d'invitation à reprendre. */
async function sendVerification(user: { id: string; name: string; email: string }, suite?: unknown): Promise<SendResult> {
  const base = appUrl();
  if (!base) {
    console.error("[email] APP_URL manquante : lien de vérification non envoyé.");
    return { ok: false, code: "not_configured" };
  }
  const token = await issueToken(emailVerificationTokens, user.id, EMAIL_VERIFICATION_HOURS);
  const url = `${base}/verification-email/${token}${suiteQuery(suite)}`;
  return sendEmail({ to: user.email, ...verificationEmail({ name: user.name, url }) });
}

export type SignupState = {
  error?: string;
  fieldErrors?: Partial<Record<"username" | "email" | "password" | "confirm", string>>;
  values?: { username: string; email: string };
};

export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const raw = {
    username: String(form.get("username") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    confirm: String(form.get("confirm") ?? ""),
  };
  const values = { username: raw.username.trim(), email: raw.email.trim() };
  const parsed = signupInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<SignupState["fieldErrors"]>;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, values };
  }
  const limited = await emailActionLimit();
  if (limited) return { error: limited, values };

  const { username, email, password } = parsed.data;
  const [{ total }] = await db.select({ total: count() }).from(users);
  let user: { id: string; name: string; email: string };
  try {
    [user] = await db
      .insert(users)
      .values({
        name: username,
        username,
        usernameConfirmedAt: new Date(),
        email,
        passwordHash: await hashPassword(password),
        color: COLORS[total % COLORS.length],
      })
      .returning({ id: users.id, name: users.name, email: users.email });
  } catch (err) {
    if (isUniqueViolation(err, "users_username_lower_uq")) {
      return { fieldErrors: { username: "Ce nom d'utilisateur est déjà pris." }, values };
    }
    if (isUniqueViolation(err)) {
      return { fieldErrors: { email: "Un compte existe déjà avec cet email. Connectez-vous, ou utilisez « Mot de passe oublié »." }, values };
    }
    throw err;
  }

  const suite = form.get("suite");
  // Sans envoi d'emails, pas de vérification : direction l'accueil, ou le lien d'invitation.
  if (!isEmailEnabled()) {
    await createSession(user.id);
    redirect(afterLoginPath(suite));
  }
  const sent = await sendVerification(user, suite);
  await createSession(user.id);
  const query = new URLSearchParams();
  if (!sent.ok) query.set("envoi", sent.code);
  const next = afterLoginPath(suite);
  if (next !== "/") query.set("suite", next);
  redirect(`/verification-email${query.size > 0 ? `?${query}` : ""}`);
}

/** Renvoie l'email de vérification au compte connecté. */
export async function resendVerification(suite?: string): Promise<ActionResult> {
  const me = await requireUser();
  if (me.emailVerifiedAt) return fail("Votre adresse email est déjà vérifiée.");
  if (!isEmailEnabled()) return fail(emailErrorMessage("not_configured"));
  const limited = await emailActionLimit();
  if (limited) return fail(limited);
  const sent = await sendVerification(me, suite);
  return sent.ok ? ok(undefined) : fail(emailErrorMessage(sent.code));
}

/**
 * Confirme l'adresse email avec le jeton reçu (valable 24 h, une seule fois). Pas besoin d'être
 * connecté : le jeton prouve que l'on reçoit les emails de cette adresse.
 */
export async function verifyEmail(token: string): Promise<ActionResult> {
  if (!isTokenShaped(token)) return fail("Lien de vérification invalide ou expiré.");
  // Une seule instruction : le jeton est consommé et l'adresse marquée vérifiée ensemble.
  const result = await db.execute<{ id: string }>(sql`
    with used as (
      update ${emailVerificationTokens} set used_at = now()
      where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
      returning user_id
    )
    update ${users} set email_verified_at = coalesce(email_verified_at, now())
    from used where ${users.id} = used.user_id
    returning ${users.id} as id
  `);
  if (result.rows.length === 0) return fail("Lien de vérification invalide, expiré ou déjà utilisé.");
  return ok(undefined);
}

// --- Mot de passe oublié --------------------------------------------------------

export type ForgotState = { done?: boolean; error?: string; email?: string };

/**
 * Envoie un lien de réinitialisation si un compte a cet email. La réponse est la même dans tous
 * les cas (y compris si l'envoi échoue : l'échec est journalisé côté serveur).
 */
export async function requestPasswordReset(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  if (!isEmailEnabled()) return { error: RESET_BY_ADMIN };
  const parsed = emailInput.safeParse(String(form.get("email") ?? ""));
  if (!parsed.success) return { error: firstError(parsed.error), email: String(form.get("email") ?? "") };
  const limited = await emailActionLimit();
  if (limited) return { error: limited, email: parsed.data };

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${parsed.data}`)
    .limit(1);
  const base = appUrl();
  if (user && base) {
    const token = await issueToken(passwordResetTokens, user.id, PASSWORD_RESET_HOURS);
    await sendEmail({ to: user.email, ...passwordResetEmail({ name: user.name, url: `${base}/reinitialisation/${token}` }) });
  } else if (user) {
    console.error("[email] APP_URL manquante : lien de réinitialisation non envoyé.");
  }
  return { done: true, email: parsed.data };
}

/** Jeton de réinitialisation encore valable (pour afficher le formulaire ou un message d'erreur). */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!isTokenShaped(token)) return false;
  const [row] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}

export type ResetState = { error?: string; fieldErrors?: Partial<Record<"password" | "confirm", string>> };

/**
 * Nouveau mot de passe avec le jeton reçu (valable 1 h, une seule fois). En une seule instruction :
 * jeton consommé, mot de passe changé, toutes les sessions du compte fermées.
 */
export async function resetPassword(_prev: ResetState, form: FormData): Promise<ResetState> {
  const token = String(form.get("token") ?? "");
  const parsed = resetPasswordInput.safeParse({ password: String(form.get("password") ?? ""), confirm: String(form.get("confirm") ?? "") });
  if (!parsed.success) {
    const fieldErrors: ResetState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as "password" | "confirm"] ??= issue.message;
    return { fieldErrors };
  }
  const invalid = { error: "Ce lien de réinitialisation est invalide, a expiré ou a déjà servi. Demandez-en un nouveau." };
  if (!isTokenShaped(token)) return invalid;

  const passwordHash = await hashPassword(parsed.data.password);
  const tokenHash = hashToken(token);
  const result = await db.execute<{ id: string }>(sql`
    with used as (
      update ${passwordResetTokens} set used_at = now()
      where token_hash = ${tokenHash} and used_at is null and expires_at > now()
      returning user_id
    ),
    changed as (
      update ${users} set password_hash = ${passwordHash}, updated_at = now()
      from used where ${users.id} = used.user_id
      returning ${users.id} as id
    ),
    closed as (
      delete from ${sessions} using used where ${sessions.userId} = used.user_id
    ),
    others as (
      update ${passwordResetTokens} t set used_at = now()
      from used where t.user_id = used.user_id and t.used_at is null and t.token_hash <> ${tokenHash}
    )
    select id from changed
  `);
  const [changed] = result.rows;
  if (!changed) return invalid;
  // Le compte peut se reconnecter tout de suite, même s'il était verrouillé.
  await clearFailures([`login-account:${changed.id}`]);
  redirect("/connexion?reinitialise=1");
}

// --- Nom d'utilisateur ----------------------------------------------------------

export type UsernameCheck = { available: boolean; error?: string };

/**
 * Disponibilité d'un nom d'utilisateur, pour la vérification en temps réel du formulaire
 * d'inscription. Limitée par IP : elle permet de tester l'existence d'un nom.
 */
export async function checkUsername(username: string): Promise<UsernameCheck> {
  const value = String(username).trim();
  const formatError = usernameFormatError(value);
  if (formatError) return { available: false, error: formatError };

  const key = `username-check:${await clientIp()}`;
  const wait = (await lockedFor([key])) || (await recordFailure(key, USERNAME_CHECK_IP));
  if (wait > 0) return { available: false, error: tooMany(wait) };

  const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${value.toLowerCase()}`).limit(1);
  return taken ? { available: false, error: "Ce nom d'utilisateur est déjà pris" } : { available: true };
}

/** Choisit (ou confirme) le nom d'utilisateur du compte connecté. */
export async function setUsername(username: string): Promise<ActionResult<{ username: string }>> {
  const me = await requireUser();
  const parsed = usernameInput.safeParse(username);
  if (!parsed.success) return fail(firstError(parsed.error));
  try {
    await db.update(users).set({ username: parsed.data, usernameConfirmedAt: new Date() }).where(eq(users.id, me.id));
  } catch (err) {
    if (isUniqueViolation(err)) return fail("Ce nom d'utilisateur est déjà pris.");
    throw err;
  }
  return ok({ username: parsed.data });
}
