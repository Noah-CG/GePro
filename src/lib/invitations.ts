/**
 * Jetons d'invitation : aléatoires, transmis dans le lien /invitations/<jeton>, et stockés en base
 * sous forme de hash SHA-256 seulement (comme les sessions).
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Durée de validité d'une invitation. */
export const INVITATION_DAYS = 7;

export const newInvitationToken = () => randomBytes(32).toString("base64url");

export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

const INVITATION_PATH = /^\/invitations\/[A-Za-z0-9_-]{1,100}$/;

/** Page où aller après la connexion : un lien d'invitation (seul chemin repris), sinon l'accueil. */
export function afterLoginPath(suite: unknown): string {
  return typeof suite === "string" && INVITATION_PATH.test(suite) ? suite : "/";
}
