"use server";

import { count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projects, sessions, users } from "@/db/schema";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { isUniqueViolation } from "@/lib/db-errors";
import { firstError, isUuid, memberInput, password, type MemberInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

const ACCOUNT_NOT_FOUND = "Compte introuvable.";

/** Création d'un compte par un administrateur. */
export async function createMember(input: MemberInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { password: pwd, ...data } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1);
  if (existing) return fail("Un compte existe déjà avec cet email.");
  const [{ total }] = await db.select({ total: count() }).from(users);

  try {
    await db.insert(users).values({
      ...data,
      passwordHash: await hashPassword(pwd),
      color: COLORS[total % COLORS.length],
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fail("Un compte existe déjà avec cet email.");
    throw err;
  }
  refresh();
  return ok(undefined);
}

/**
 * Réinitialise le mot de passe d'un compte (pas d'email : c'est le seul recours en cas d'oubli) et
 * le déconnecte de tous ses appareils. Pouvoir fort (l'administrateur peut ensuite se connecter à
 * sa place) : chaque réinitialisation est journalisée.
 */
export async function resetMemberPassword(id: string, newPassword: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isUuid(id)) return fail(ACCOUNT_NOT_FOUND);
  const parsed = password.safeParse(newPassword);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [row] = await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data) })
    .where(eq(users.id, id))
    .returning({ email: users.email });
  if (!row) return fail(ACCOUNT_NOT_FOUND);
  await db.delete(sessions).where(eq(sessions.userId, id));
  console.info(`[comptes] mot de passe de ${row.email} (${id}) réinitialisé par ${me.email} (${me.id})`);
  return ok(undefined);
}

export async function deleteMember(id: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isUuid(id)) return fail(ACCOUNT_NOT_FOUND);
  if (id === me.id) return fail("Vous ne pouvez pas supprimer votre propre compte.");
  // Ses projets resteraient sans propriétaire : il doit d'abord les transmettre ou les supprimer.
  const [owned] = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, id)).limit(1);
  if (owned) return fail("Ce compte est propriétaire de projets : il doit d'abord les transmettre à un autre membre ou les supprimer.");
  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ email: users.email });
  if (!deleted) return fail(ACCOUNT_NOT_FOUND);
  console.info(`[comptes] compte ${deleted.email} (${id}) supprimé par ${me.email} (${me.id})`);
  refresh();
  return ok(undefined);
}
