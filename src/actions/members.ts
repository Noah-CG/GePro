"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projects, sessions, users } from "@/db/schema";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { COLORS } from "@/lib/constants";
import { firstError, memberInput, password, type MemberInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

/** Création d'un compte par un administrateur. */
export async function createMember(input: MemberInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = memberInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { password: pwd, ...data } = parsed.data;

  const existing = await db.select({ id: users.id, email: users.email }).from(users);
  if (existing.some((u) => u.email === data.email)) return fail("Un compte existe déjà avec cet email.");

  await db.insert(users).values({
    ...data,
    passwordHash: await hashPassword(pwd),
    color: COLORS[existing.length % COLORS.length],
  });
  refresh();
  return ok(undefined);
}

export async function resetMemberPassword(id: string, newPassword: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = password.safeParse(newPassword);
  if (!parsed.success) return fail(firstError(parsed.error));

  await db.update(users).set({ passwordHash: await hashPassword(parsed.data) }).where(eq(users.id, id));
  // Déconnecte le membre de tous ses appareils.
  await db.delete(sessions).where(eq(sessions.userId, id));
  return ok(undefined);
}

export async function deleteMember(id: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return fail("Vous ne pouvez pas supprimer votre propre compte.");
  // Ses projets resteraient sans propriétaire : il doit d'abord les transmettre ou les supprimer.
  const [owned] = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, id)).limit(1);
  if (owned) return fail("Ce compte est propriétaire de projets : il doit d'abord les transmettre à un autre membre ou les supprimer.");
  await db.delete(users).where(eq(users.id, id));
  refresh();
  return ok(undefined);
}
