"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { afterLoginPath } from "@/lib/invitations";
import { firstError, password as passwordSchema } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Renseignez votre email et votre mot de passe.", email };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Même message dans les deux cas pour ne pas révéler quels emails existent.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Email ou mot de passe incorrect.", email };
  }

  await createSession(user.id);
  redirect(afterLoginPath(form.get("suite")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
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
