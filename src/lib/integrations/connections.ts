/**
 * Comptes externes des utilisateurs : enregistrement, lecture et rafraîchissement des jetons.
 *
 * Les jetons ne sont déchiffrés qu'ici, au moment d'appeler le fournisseur, et ne sont
 * jamais renvoyés au navigateur.
 */
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { externalConnections, externalResources, type ExternalConnection, type IntegrationProvider } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { errorCodeOf, IntegrationError } from "./errors";
import { refreshAccessToken, revokeToken, type GoogleAccount, type GoogleTokens } from "./google";

/** On rafraîchit un jeton d'accès qui expire dans moins d'une minute. */
const EXPIRY_MARGIN_MS = 60_000;

export async function getConnection(userId: string, provider: IntegrationProvider): Promise<ExternalConnection | null> {
  const [row] = await db
    .select()
    .from(externalConnections)
    .where(and(eq(externalConnections.userId, userId), eq(externalConnections.provider, provider)))
    .limit(1);
  return row ?? null;
}

/** Crée ou remplace la connexion Google de l'utilisateur après un consentement réussi. */
export async function saveGoogleConnection(userId: string, tokens: GoogleTokens, account: GoogleAccount) {
  const values = {
    accountId: account.id,
    accountEmail: account.email,
    scopes: tokens.scope,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    accessTokenExpiresAt: tokens.expiresAt,
    status: "active" as const,
  };
  const [row] = await db
    .insert(externalConnections)
    .values({ userId, provider: "google", ...values })
    .onConflictDoUpdate({
      target: [externalConnections.userId, externalConnections.provider],
      set: {
        ...values,
        // Sans nouveau refresh token, on garde l'ancien, mais seulement s'il s'agit du même compte Google.
        refreshTokenEnc:
          values.refreshTokenEnc ??
          sql`case when ${externalConnections.accountId} = ${account.id} then ${externalConnections.refreshTokenEnc} end`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: externalConnections.id });

  // Documents rattachés avant une déconnexion : ils reprennent ce compte pour leur synchronisation.
  await db
    .update(externalResources)
    .set({ connectionId: row.id })
    .where(
      and(
        eq(externalResources.attachedBy, userId),
        eq(externalResources.provider, "google"),
        isNull(externalResources.connectionId),
      ),
    );
}

/** Déconnecte le compte : révocation chez Google, puis suppression (les documents restent, sans synchronisation). */
export async function deleteGoogleConnection(connection: ExternalConnection) {
  // Révoquer le refresh token révoque toute l'autorisation ; à défaut, le jeton d'accès.
  const token = readToken(connection.refreshTokenEnc) ?? readToken(connection.accessTokenEnc);
  if (token) await revokeToken(token);
  await db.delete(externalConnections).where(eq(externalConnections.id, connection.id));
}

/** Jeton révoqué ou expiré : on efface les jetons devenus inutiles et on demande une reconnexion. */
export async function markNeedsReauth(connection: ExternalConnection) {
  Object.assign(connection, { status: "needs_reauth", accessTokenEnc: null, refreshTokenEnc: null, accessTokenExpiresAt: null });
  await db
    .update(externalConnections)
    .set({ status: "needs_reauth", accessTokenEnc: null, refreshTokenEnc: null, accessTokenExpiresAt: null })
    .where(eq(externalConnections.id, connection.id));
}

/**
 * Exécute un appel Google avec un jeton d'accès valide :
 * - le jeton est rafraîchi s'il a expiré ou va expirer ;
 * - si Google le refuse malgré tout (401), il est rafraîchi une fois et l'appel relancé ;
 * - si le rafraîchissement est refusé (révocation, expiration), la connexion passe en
 *   "needs_reauth" et l'appel lève `reauth_required`.
 */
export async function withGoogleAccess<T>(connection: ExternalConnection, call: (accessToken: string) => Promise<T>): Promise<T> {
  if (connection.status !== "active") throw new IntegrationError("reauth_required");
  try {
    return await call(await getAccessToken(connection, false));
  } catch (e) {
    if (errorCodeOf(e) !== "unauthorized") throw e;
  }
  try {
    return await call(await getAccessToken(connection, true));
  } catch (e) {
    if (errorCodeOf(e) !== "unauthorized") throw e;
    await markNeedsReauth(connection);
    throw new IntegrationError("reauth_required", "jeton refusé juste après son rafraîchissement");
  }
}

/**
 * Jeton d'accès utilisable. La connexion passée en paramètre est mise à jour en mémoire, pour
 * que les appels suivants de la même requête réutilisent le jeton rafraîchi.
 */
async function getAccessToken(connection: ExternalConnection, forceRefresh: boolean): Promise<string> {
  const expiresAt = connection.accessTokenExpiresAt?.getTime() ?? 0;
  const current = readToken(connection.accessTokenEnc);
  if (current && !forceRefresh && expiresAt - Date.now() > EXPIRY_MARGIN_MS) return current;

  const refreshToken = readToken(connection.refreshTokenEnc);
  if (!refreshToken) {
    await markNeedsReauth(connection);
    throw new IntegrationError("reauth_required", "aucun refresh token utilisable");
  }

  let tokens: GoogleTokens;
  try {
    tokens = await refreshAccessToken(refreshToken);
  } catch (e) {
    if (errorCodeOf(e) === "reauth_required") await markNeedsReauth(connection);
    throw e;
  }

  const update = {
    accessTokenEnc: encryptSecret(tokens.accessToken),
    accessTokenExpiresAt: tokens.expiresAt,
    // Google peut émettre un nouveau refresh token : l'ancien n'est alors plus garanti.
    ...(tokens.refreshToken && { refreshTokenEnc: encryptSecret(tokens.refreshToken) }),
  };
  Object.assign(connection, update);
  await db.update(externalConnections).set(update).where(eq(externalConnections.id, connection.id));
  return tokens.accessToken;
}

/** Déchiffre un jeton ; null s'il est absent ou illisible (clé de chiffrement changée). */
function readToken(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch (e) {
    console.error("[integrations] jeton indéchiffrable (INTEGRATIONS_ENCRYPTION_KEY a-t-elle changé ?)", e);
    return null;
  }
}
