"use server";

/**
 * Comptes : connexion (email ou nom d'utilisateur), inscription, nom d'utilisateur.
 *
 * - Pas de vérification d'email ni de mot de passe oublié par email : un compte est utilisable dès
 *   l'inscription, et un administrateur réinitialise un mot de passe depuis /membres.
 * - Les messages d'échec de connexion ne révèlent pas quels comptes existent. Les tentatives sont
 *   limitées par IP et par compte (lib/throttle.ts), l'inscription par IP.
 * - Les sessions gardent leur format d'origine (lib/auth.ts).
 */
import { count, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { isUniqueViolation } from "@/lib/db-errors";
import { afterLoginPath } from "@/lib/invitations";
import { verifyAgainstDummy } from "@/lib/password";
import {
  clearFailures,
  clientIp,
  formatWait,
  LOGIN_ACCOUNT,
  LOGIN_IP,
  lockedFor,
  recordFailure,
  SIGNUP_IP,
  USERNAME_CHECK_IP,
} from "@/lib/throttle";
import { usernameFormatError } from "@/lib/usernames";
import { firstError, password as passwordSchema, signupInput, usernameInput } from "@/lib/validation";
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

// --- Inscription ----------------------------------------------------------------

type SignupField = "firstName" | "lastName" | "username" | "email" | "password" | "confirm";

export type SignupState = {
  error?: string;
  fieldErrors?: Partial<Record<SignupField, string>>;
  values?: { firstName: string; lastName: string; username: string; email: string };
};

/** Crée le compte, ouvre la session et mène à l'accueil (ou au lien d'invitation à reprendre). */
export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const raw = {
    firstName: String(form.get("firstName") ?? ""),
    lastName: String(form.get("lastName") ?? ""),
    username: String(form.get("username") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    confirm: String(form.get("confirm") ?? ""),
  };
  const values = { firstName: raw.firstName.trim(), lastName: raw.lastName.trim(), username: raw.username.trim(), email: raw.email.trim() };
  const parsed = signupInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as SignupField;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, values };
  }
  const key = `signup-ip:${await clientIp()}`;
  const wait = (await lockedFor([key])) || (await recordFailure(key, SIGNUP_IP));
  if (wait > 0) return { error: tooMany(wait), values };

  const { firstName, lastName, username, email, password } = parsed.data;
  const [{ total }] = await db.select({ total: count() }).from(users);
  let userId: string;
  try {
    [{ id: userId }] = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        username,
        usernameConfirmedAt: new Date(),
        email,
        passwordHash: await hashPassword(password),
        color: COLORS[total % COLORS.length],
      })
      .returning({ id: users.id });
  } catch (err) {
    if (isUniqueViolation(err, "users_username_lower_uq")) {
      return { fieldErrors: { username: "Ce nom d'utilisateur est déjà pris." }, values };
    }
    if (isUniqueViolation(err)) {
      return { fieldErrors: { email: "Un compte existe déjà avec cet email. Connectez-vous." }, values };
    }
    throw err;
  }

  await createSession(userId);
  redirect(afterLoginPath(form.get("suite")));
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
