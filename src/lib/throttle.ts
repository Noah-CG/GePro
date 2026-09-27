/**
 * Limitation des tentatives, stockée en base (table auth_throttle) : l'application tourne sur
 * plusieurs instances sans mémoire partagée (Vercel, serveur Linux).
 *
 * Chaque clé ("login-ip:1.2.3.4", "login-account:<id>"…) compte ses tentatives avant de les
 * mener (`claimAttempt`). Au-delà de `free` échecs, elle est verrouillée pour une durée qui double
 * à chaque nouvel échec (`baseSeconds`, 2×, 4×… jusqu'à `maxSeconds`). Le compteur repart de zéro
 * après `resetSeconds` sans échec, ou dès une réussite (`clearFailures`, `releaseAttempt`). Chaque
 * tentative est une seule instruction SQL : pas de transaction, compatible avec le driver HTTP de Neon.
 */
import "server-only";
import { eq, inArray, lt, sql } from "drizzle-orm";
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

/**
 * Adresse IP du client, pour la limitation par IP. Sur Vercel, `x-vercel-forwarded-for` (posé par
 * Vercel, que le client ne peut pas imposer). Ailleurs, `x-real-ip` posé par le proxy inverse,
 * sinon la dernière adresse de `X-Forwarded-For` : celle ajoutée par le proxy le plus proche (les
 * premières viennent du client et peuvent être inventées). Sans proxy devant l'application, ces
 * en-têtes viennent du client : placez-la derrière un proxy qui les pose (voir le README).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const vercel = process.env.VERCEL ? h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : undefined;
  const forwarded = h.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return vercel || h.get("x-real-ip")?.trim() || forwarded || "inconnue";
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

/** Nouveau nombre d'échecs : repart à 1 si le dernier date de plus de `resetSeconds`. */
const nextFailures = ({ resetSeconds }: ThrottlePolicy) =>
  sql`(case when ${authThrottle.updatedAt} < now() - make_interval(secs => ${resetSeconds}) then 1 else ${authThrottle.failures} + 1 end)`;

/** Fin du verrouillage pour `failures` échecs : durée doublée à chaque échec au-delà de `free`. */
const lockAfter = ({ free, baseSeconds, maxSeconds }: ThrottlePolicy, failures: ReturnType<typeof sql>) =>
  sql`case when ${failures} > ${free} then now() + make_interval(secs => least(${maxSeconds}::float8, ${baseSeconds}::float8 * power(2, ${failures} - ${free} - 1))) end`;

const secondsUntil = (date: Date | string | null | undefined) => {
  const ms = date ? new Date(date).getTime() - Date.now() : 0;
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
};

/**
 * Compte une tentative AVANT de la mener (vérification du mot de passe…), en une seule
 * instruction : des requêtes simultanées ne peuvent pas toutes passer avant le verrouillage.
 * - `claimed: false` : la clé était déjà verrouillée, rien n'est compté ; `wait` = secondes restantes.
 * - `claimed: true` : tentative comptée ; `wait` > 0 si elle vient de verrouiller la clé.
 * Une tentative réussie s'oublie avec `clearFailures` ou `releaseAttempt`.
 */
export async function claimAttempt(key: string, policy: ThrottlePolicy): Promise<{ claimed: boolean; wait: number }> {
  const failures = nextFailures(policy);
  const [row] = await db
    .insert(authThrottle)
    .values({ key, failures: 1, lockedUntil: policy.free < 1 ? sql`now() + make_interval(secs => ${policy.baseSeconds})` : null })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: { failures: sql`${failures}`, lockedUntil: lockAfter(policy, failures), updatedAt: sql`now()` },
      // Verrouillée : la ligne n'est pas modifiée et rien n'est renvoyé.
      setWhere: sql`${authThrottle.lockedUntil} is null or ${authThrottle.lockedUntil} <= now()`,
    })
    .returning({ lockedUntil: authThrottle.lockedUntil });
  if (!row) return { claimed: false, wait: (await lockedFor([key])) || 1 };
  return { claimed: true, wait: secondsUntil(row.lockedUntil) };
}

/** Annule une tentative comptée par `claimAttempt` qui a réussi, sans effacer les échecs précédents. */
export async function releaseAttempt(key: string, { free }: ThrottlePolicy): Promise<void> {
  const failures = sql`greatest(${authThrottle.failures} - 1, 0)`;
  await db
    .update(authThrottle)
    .set({ failures: sql`${failures}`, lockedUntil: sql`case when ${failures} > ${free} then ${authThrottle.lockedUntil} end` })
    .where(eq(authThrottle.key, key));
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
