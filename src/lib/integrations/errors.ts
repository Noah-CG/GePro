/**
 * Erreurs des intégrations externes (Google, puis GitHub).
 *
 * Le code est stocké en base (`external_resources.sync_error`) et transmis dans l'URL après
 * la connexion OAuth ; le message lisible n'est choisi qu'à l'affichage. Ce module ne dépend
 * de rien côté serveur : les composants client l'importent pour traduire les codes.
 */

export const INTEGRATION_ERROR_MESSAGES = {
  not_configured: "L'intégration Google n'est pas configurée sur ce serveur.",
  misconfigured:
    "L'intégration Google est mal configurée côté serveur (identifiants OAuth refusés ou API Google Drive non activée). Prévenez l'administrateur.",
  not_connected: "Connectez d'abord votre compte Google dans les paramètres du projet.",
  reauth_required: "La connexion Google a expiré ou a été révoquée. Reconnectez votre compte dans les paramètres du projet.",
  missing_scope: "L'accès en lecture à Google Drive n'a pas été autorisé. Reconnectez votre compte en cochant cette autorisation.",
  access_denied: "Connexion à Google annulée.",
  invalid_state: "La demande de connexion a expiré ou n'est pas valide. Réessayez.",
  unauthorized: "Google a refusé l'accès. Reconnectez votre compte dans les paramètres du projet.",
  forbidden: "Votre compte Google n'a pas accès à ce document.",
  not_found: "Ce document n'existe pas ou votre compte Google n'y a pas accès.",
  trashed: "Ce document a été placé dans la corbeille de Google Drive.",
  not_a_doc: "Ce fichier n'est pas un Google Doc.",
  too_large: "Ce document est trop volumineux pour être affiché dans GePro (10 Mo au maximum). Ouvrez-le dans Google Docs.",
  disconnected: "Le compte Google qui avait rattaché ce document a été déconnecté : GePro ne peut plus le lire.",
  invalid_link: "Lien non reconnu. Collez l'adresse d'un Google Doc (https://docs.google.com/document/d/…).",
  quota: "Google limite temporairement le nombre de requêtes. Réessayez dans quelques minutes.",
  unavailable: "Google Drive ne répond pas correctement pour le moment. Réessayez dans quelques minutes.",
  network: "Impossible de joindre Google. Vérifiez la connexion réseau puis réessayez.",
  unknown: "Erreur inattendue avec Google. Réessayez plus tard.",
} as const;

export type IntegrationErrorCode = keyof typeof INTEGRATION_ERROR_MESSAGES;

/** Erreurs passagères : une nouvelle tentative plus tard a des chances d'aboutir. */
export const TRANSIENT_ERRORS: readonly IntegrationErrorCode[] = ["quota", "unavailable", "network", "unknown"];

export class IntegrationError extends Error {
  constructor(
    readonly code: IntegrationErrorCode,
    /** Détail technique, pour les journaux serveur uniquement. */
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "IntegrationError";
  }
}

export function isIntegrationErrorCode(value: unknown): value is IntegrationErrorCode {
  return typeof value === "string" && Object.hasOwn(INTEGRATION_ERROR_MESSAGES, value);
}

export function errorCodeOf(error: unknown): IntegrationErrorCode {
  return error instanceof IntegrationError ? error.code : "unknown";
}

/** Code d'une erreur attrapée ; les erreurs inattendues sont journalisées au passage. */
export function reportIntegrationError(error: unknown): IntegrationErrorCode {
  const code = errorCodeOf(error);
  if (code === "unknown" || code === "misconfigured") console.error("[integrations]", error);
  return code;
}

/** Message affichable pour un code d'erreur. */
export const integrationErrorMessage = (code: IntegrationErrorCode) => INTEGRATION_ERROR_MESSAGES[code];

/**
 * Problème de synchronisation ou de lecture d'une ressource rattachée. Le compte Google utilisé
 * est celui de la personne qui a rattaché la ressource, pas forcément celle qui la consulte.
 */
export function resourceProblemMessage(code: IntegrationErrorCode, attachedByName: string | null): string {
  const who = attachedByName ?? "la personne qui l'a rattaché";
  switch (code) {
    case "disconnected":
      return `Plus synchronisé : le compte Google de ${who} a été déconnecté. Informations affichées : les dernières connues.`;
    case "reauth_required":
    case "unauthorized":
      return `Synchronisation suspendue : la connexion Google de ${who} a expiré ou a été révoquée.`;
    case "not_found":
    case "forbidden":
      return `Document introuvable, ou le compte Google de ${who} n'y a plus accès.`;
    default:
      return INTEGRATION_ERROR_MESSAGES[code];
  }
}
