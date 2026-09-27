/**
 * Limitation des tentatives, stockée en base (table auth_throttle) : l'application tourne sur
 * plusieurs instances sans mémoire partagée (Vercel, serveur Linux).
 *
 * Chaque clé ("login-ip:1.2.3.4", "login-account:<id>"…) compte ses échecs. Au-delà de `free`
 * échecs, elle est verrouillée pour une durée qui double à chaque nouvel échec (`baseSeconds`,
 * 2×, 4×… jusqu'à `maxSeconds`). Le compteur repart de zéro après `resetSeconds` sans échec, ou
 * dès une réussite (`clearFailures`). Chaque échec est une seule instruction SQL : pas de
 * transaction, compatible avec le driver HTTP de Neon.
 */
import "server-only";
import { inArray, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { authThrottle } from "@/db/schema";

export type ThrottlePolicy = { free: number; baseSeconds: number; maxSeconds: number; resetSeconds: number };

/** Connexion, par compte (ou identifiant inconnu) : 5 essais, puis 30 s, 1 min, 2 min… jusqu'à 1 h. */
export const LOGIN_ACCOUNT: ThrottlePolicy = { free: 5, baseSeconds: 30, maxSeconds: 3600, resetSeconds: 86_400 };
/** Connexion, par adresse IP (plusieurs comptes derrière un même réseau) : 20 essais, puis 1 min… 1 h. */
export const LOGIN_IP: ThrottlePolicy = { free: 20, baseSeconds: 60, maxSeconds: 3600, resetSeconds: 86_400 };
/** Inscriptions, par IP : 10 par heure. */
export const SIGNUP_IP: ThrottlePolicy = { free: 10, baseSeconds: 600, maxSeconds: 3600, resetSeconds: 3600 };
/** Vérification de disponibilité d'un nom d'utilisateur, par IP. */
export const USERNAME_CHECK_IP: ThrottlePolicy = { free: 120, baseSeconds: 60, maxSeconds: 900, resetSeconds: 3600 };

/** Adresse IP du client (première de X-Forwarded-For, posé par Vercel ou le proxy du serveur). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "inconnue";
}

/** Secondes avant la fin du verrouillage le plus long parmi `keys`, ou 0 si aucune n'est verrouillée. */
export async function lockedFor(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const [row] = await db
    .select({ until: sql<Date | string | null>`max(${authThrottle.lockedUntil})` })
    .from(authThrottle)
    .where(inArray(authThrottle.key, keys));
  if (!row?.until) return 0;
  const ms = new Date(row.until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/**
 * Enregistre un échec (ou une action comptée) et verrouille la clé si le seuil est dépassé.
 * Renvoie la durée du verrouillage en secondes (0 si la clé n'est pas verrouillée).
 */
export async function recordFailure(key: string, policy: ThrottlePolicy): Promise<number> {
  const { free, baseSeconds, maxSeconds, resetSeconds } = policy;
  // Nouveau nombre d'échecs : repart à 1 si le dernier date de plus de `resetSeconds`.
  const failures = sql`(case when ${authThrottle.updatedAt} < now() - make_interval(secs => ${resetSeconds}) then 1 else ${authThrottle.failures} + 1 end)`;
  const lock = (f: ReturnType<typeof sql>) =>
    sql`case when ${f} > ${free} then now() + make_interval(secs => least(${maxSeconds}::float8, ${baseSeconds}::float8 * power(2, ${f} - ${free} - 1))) end`;
  const [row] = await db
    .insert(authThrottle)
    .values({ key, failures: 1, lockedUntil: free < 1 ? sql`now() + make_interval(secs => ${baseSeconds})` : null })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: { failures: sql`${failures}`, lockedUntil: lock(failures), updatedAt: sql`now()` },
    })
    .returning({ lockedUntil: authThrottle.lockedUntil });
  const ms = row?.lockedUntil ? new Date(row.lockedUntil).getTime() - Date.now() : 0;
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Réussite : oublie les échecs de ces clés (et fait le ménage des clés inactives depuis une semaine). */
export async function clearFailures(keys: string[]): Promise<void> {
  if (keys.length > 0) await db.delete(authThrottle).where(inArray(authThrottle.key, keys));
  await db.delete(authThrottle).where(lt(authThrottle.updatedAt, sql`now() - interval '7 days'`));
}

/** « 45 secondes », « 3 minutes », « 1 heure ». */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconde${seconds > 1 ? "s" : ""}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} heure${hours > 1 ? "s" : ""}`;
}
