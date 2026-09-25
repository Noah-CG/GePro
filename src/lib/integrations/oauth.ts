/**
 * État d'une connexion OAuth en cours, entre la redirection vers le fournisseur et son retour.
 *
 * - `state` : jeton aléatoire comparé au retour, contre les requêtes forgées (CSRF).
 * - PKCE : le `verifier` reste côté serveur, seul son empreinte SHA-256 part chez le fournisseur ;
 *   un code d'autorisation intercepté est donc inutilisable.
 *
 * Le tout vit dans un cookie httpOnly de 10 minutes, limité aux routes du fournisseur.
 * Ce cookie est indépendant de la session de l'application (lib/auth.ts).
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { IntegrationProvider } from "@/db/schema";

type OAuthFlow = {
  state: string;
  verifier: string;
  returnTo: string;
  /** Droits indispensables à ce parcours : refus de l'un d'eux = connexion refusée. */
  requiredScopes: string[];
};

const cookieName = (provider: IntegrationProvider) => `gepro_oauth_${provider}`;
const cookiePath = (provider: IntegrationProvider) => `/api/integrations/${provider}`;

/** Chemin interne uniquement : jamais d'URL absolue ni de "//hote" (redirection ouverte). */
export const isSafeReturnPath = (path: string) => path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");

/** Démarre une connexion : mémorise state + verifier et renvoie ce qu'il faut transmettre au fournisseur. */
export async function startOAuthFlow(provider: IntegrationProvider, returnTo: string, requiredScopes: string[]) {
  const flow: OAuthFlow = {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    returnTo: isSafeReturnPath(returnTo) ? returnTo : "/",
    requiredScopes,
  };
  (await cookies()).set(cookieName(provider), JSON.stringify(flow), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // "lax" : le cookie accompagne la redirection GET de retour depuis le fournisseur.
    sameSite: "lax",
    path: cookiePath(provider),
    maxAge: 600,
  });
  return { state: flow.state, codeChallenge: createHash("sha256").update(flow.verifier).digest("base64url") };
}

/** Lit et supprime l'état mémorisé (usage unique). Null s'il manque ou est illisible. */
export async function takeOAuthFlow(provider: IntegrationProvider): Promise<OAuthFlow | null> {
  const store = await cookies();
  const raw = store.get(cookieName(provider))?.value;
  store.set(cookieName(provider), "", { path: cookiePath(provider), maxAge: 0 });
  if (!raw) return null;
  try {
    const flow = JSON.parse(raw) as Partial<OAuthFlow>;
    if (typeof flow.state !== "string" || typeof flow.verifier !== "string" || typeof flow.returnTo !== "string") return null;
    if (!isSafeReturnPath(flow.returnTo)) return null;
    const requiredScopes = Array.isArray(flow.requiredScopes) ? flow.requiredScopes.filter((s) => typeof s === "string") : [];
    return { state: flow.state, verifier: flow.verifier, returnTo: flow.returnTo, requiredScopes };
  } catch {
    return null;
  }
}
