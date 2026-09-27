"use server";

/**
 * Comptes : connexion par email, inscription.
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
import { createSession, destroyOtherSessions, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { isUniqueViolation } from "@/lib/db-errors";
import { afterLoginPath } from "@/lib/invitations";
import { verifyAgainstDummy } from "@/lib/password";
import { claimAttempt, clearFailures, clientIp, formatWait, LOGIN_ACCOUNT, LOGIN_IP, releaseAttempt, SIGNUP_IP } from "@/lib/throttle";
import { firstError, password as passwordSchema, signupInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const tooMany = (seconds: number) => `Trop de tentatives. Réessayez dans ${formatWait(seconds)}.`;
const BAD_CREDENTIALS = "Identifiants incorrects.";

/** Compte désigné par son email, sans tenir compte de la casse. */
async function findByEmail(email: string) {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return user ?? null;
}

// --- Connexion ----------------------------------------------------------------

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().slice(0, 254);
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Renseignez votre email et votre mot de passe.", email };

  const user = await findByEmail(email);
  const ipKey = `login-ip:${await clientIp()}`;
  // Un compte existant est compté par son id ; un email inconnu l'est aussi, pour que la réponse
  // soit la même.
  const accountKey = `login-account:${user?.id ?? email.toLowerCase()}`;

  // Tentative comptée avant la vérification : des essais simultanés ne passent pas tous.
  for (const [key, policy] of [[ipKey, LOGIN_IP], [accountKey, LOGIN_ACCOUNT]] as const) {
    const attempt = await claimAttempt(key, policy);
    if (!attempt.claimed) return { error: tooMany(attempt.wait), email };
  }

  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!user || !valid) return { error: BAD_CREDENTIALS, email };

  // Le compteur de l'IP n'est pas remis à zéro (seule cette tentative est annulée) : se connecter
  // à son propre compte ne doit pas permettre d'enchaîner les essais sur ceux des autres.
  await clearFailures([accountKey]);
  await releaseAttempt(ipKey, LOGIN_IP);
  await createSession(user.id);
  redirect(afterLoginPath(form.get("suite")));
}

export async function logout() {
  await destroySession();
  redirect("/connexion");
}

/**
 * Change le mot de passe du compte connecté (essais limités comme la connexion). Les autres
 * sessions du compte sont fermées : un appareil perdu ou une session volée perd l'accès.
 */
export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const me = await requireUser();
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return fail(firstError(parsed.error));

  const key = `password-change:${me.id}`;
  const attempt = await claimAttempt(key, LOGIN_ACCOUNT);
  if (!attempt.claimed) return fail(tooMany(attempt.wait));
  const [user] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!user || !(await verifyPassword(String(current), user.passwordHash))) {
    return fail("Mot de passe actuel incorrect.");
  }
  await clearFailures([key]);
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data) }).where(eq(users.id, me.id));
  await destroyOtherSessions(me.id);
  return ok(undefined);
}

// --- Inscription ----------------------------------------------------------------

type SignupField = "firstName" | "lastName" | "email" | "password" | "confirm";

export type SignupState = {
  error?: string;
  fieldErrors?: Partial<Record<SignupField, string>>;
  values?: { firstName: string; lastName: string; email: string };
};

/** Crée le compte, ouvre la session et mène à l'accueil (ou au lien d'invitation à reprendre). */
export async function signup(_prev: SignupState, form: FormData): Promise<SignupState> {
  const raw = {
    firstName: String(form.get("firstName") ?? ""),
    lastName: String(form.get("lastName") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    confirm: String(form.get("confirm") ?? ""),
  };
  const values = { firstName: raw.firstName.trim(), lastName: raw.lastName.trim(), email: raw.email.trim() };
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
  // Chaque inscription compte ; celle qui dépasse la limite est refusée aussi.
  const attempt = await claimAttempt(key, SIGNUP_IP);
  if (!attempt.claimed || attempt.wait > 0) return { error: tooMany(attempt.wait), values };

  const { firstName, lastName, email, password } = parsed.data;
  const [{ total }] = await db.select({ total: count() }).from(users);
  let userId: string;
  try {
    [{ id: userId }] = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        email,
        passwordHash: await hashPassword(password),
        color: COLORS[total % COLORS.length],
      })
      .returning({ id: users.id });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { fieldErrors: { email: "Un compte existe déjà avec cet email. Connectez-vous." }, values };
    }
    throw err;
  }

  await createSession(userId);
  redirect(afterLoginPath(form.get("suite")));
}
