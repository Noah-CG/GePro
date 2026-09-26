/**
 * Jetons d'invitation : aléatoires, transmis dans le lien /invitations/<jeton> (invitation
 * nominative) ou /rejoindre/<jeton> (lien ouvert), et stockés en base sous forme de hash SHA-256
 * seulement (comme les sessions).
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Durée de validité d'une invitation. */
export const INVITATION_DAYS = 7;

export const newInvitationToken = () => randomBytes(32).toString("base64url");

export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Lien d'invitation nominatif (/invitations/…) ou ouvert (/rejoindre/…). */
const INVITATION_PATH = /^\/(invitations|rejoindre)\/[A-Za-z0-9_-]{1,100}$/;

/**
 * Page où aller après la connexion ou l'inscription : un lien d'invitation (seuls chemins repris,
 * jamais une adresse externe), sinon l'accueil.
 */
export function afterLoginPath(suite: unknown): string {
  return typeof suite === "string" && INVITATION_PATH.test(suite) ? suite : "/";
}

/** `?suite=…` à ajouter à une adresse pour revenir au lien d'invitation, ou "" s'il n'y en a pas. */
export function suiteQuery(suite: unknown): string {
  const path = afterLoginPath(suite);
  return path === "/" ? "" : `?suite=${encodeURIComponent(path)}`;
}
