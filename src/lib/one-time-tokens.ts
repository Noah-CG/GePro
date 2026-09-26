/**
 * Jetons à usage unique envoyés par email (vérification d'adresse, réinitialisation du mot de
 * passe) : aléatoires (32 octets), stockés hachés (SHA-256), avec une date d'expiration et une
 * date d'utilisation. Émettre un nouveau jeton annule les précédents du même compte.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailVerificationTokens, passwordResetTokens } from "@/db/schema";

export const EMAIL_VERIFICATION_HOURS = 24;
export const PASSWORD_RESET_HOURS = 1;

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Forme d'un jeton dans une URL : refuse tout le reste sans interroger la base. */
export const isTokenShaped = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(token);

type TokenTable = typeof emailVerificationTokens | typeof passwordResetTokens;

/** Émet un jeton pour `userId` (les précédents non utilisés sont annulés) et le renvoie en clair. */
export async function issueToken(table: TokenTable, userId: string, hours: number): Promise<string> {
  await db
    .update(table)
    .set({ usedAt: new Date() })
    .where(and(eq(table.userId, userId), isNull(table.usedAt)));
  const token = newToken();
  await db.insert(table).values({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + hours * 3_600_000) });
  return token;
}
