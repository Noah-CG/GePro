/**
 * Erreurs de l'intégration Discord. Comme pour Google (lib/integrations/errors.ts), le code
 * circule entre serveur et navigateur ; le message lisible est choisi à l'affichage. Ce module ne
 * dépend de rien côté serveur : les composants client l'importent.
 */

export const DISCORD_ERROR_MESSAGES = {
  not_configured:
    "L'intégration Discord n'est pas configurée sur ce serveur (DISCORD_BOT_TOKEN et INTEGRATIONS_ENCRYPTION_KEY). Prévenez l'administrateur.",
  invalid_token: "Discord refuse le jeton du bot (DISCORD_BOT_TOKEN invalide ou régénéré). Prévenez l'administrateur.",
  not_linked: "Aucun salon Discord n'est relié à ce projet.",
  invalid_channel: "Identifiant non reconnu. Collez l'identifiant du salon (17 à 20 chiffres) ou son lien https://discord.com/channels/…",
  channel_not_found: "Salon Discord introuvable : il a peut-être été supprimé, ou l'identifiant est erroné.",
  not_text_channel: "Ce salon n'est pas un salon textuel d'un serveur Discord.",
  bot_not_in_guild: "Le bot GePro n'est pas (ou plus) membre de ce serveur Discord. Invitez-le avec le lien d'invitation.",
  missing_access:
    "Le bot n'a pas accès à ce salon : vérifiez qu'il est bien invité sur le serveur et qu'il a les permissions « Voir le salon » et « Voir les anciens messages ».",
  missing_permissions:
    "Il manque une permission au bot dans ce salon (Voir le salon, Envoyer des messages, Voir les anciens messages, Gérer les webhooks).",
  too_many_webhooks: "Ce salon a atteint le nombre maximal de webhooks (15) : supprimez-en un dans les paramètres du salon.",
  webhook_missing: "Le webhook GePro de ce salon a été supprimé. Reliez de nouveau le salon dans les paramètres du projet.",
  invalid_message: "Message invalide : il doit contenir entre 1 et 2 000 caractères.",
  rejected: "Discord a refusé ce message.",
  rate_limited: "Discord limite temporairement le nombre de requêtes. Réessayez dans quelques secondes.",
  unavailable: "Discord ne répond pas correctement pour le moment. Réessayez dans quelques instants.",
  network: "Impossible de joindre Discord. Vérifiez la connexion réseau puis réessayez.",
  unauthenticated: "Votre session a expiré : reconnectez-vous.",
  project_not_found: "Projet introuvable.",
  bad_request: "Requête invalide.",
  unknown: "Erreur inattendue avec Discord. Réessayez plus tard.",
} as const;

export type DiscordErrorCode = keyof typeof DISCORD_ERROR_MESSAGES;

/** Le bot ne peut pas lire le salon : problème de configuration côté Discord, à corriger à la main. */
export const ACCESS_ERRORS: readonly DiscordErrorCode[] = [
  "invalid_token",
  "channel_not_found",
  "not_text_channel",
  "bot_not_in_guild",
  "missing_access",
  "missing_permissions",
  "webhook_missing",
];

export class DiscordError extends Error {
  constructor(
    readonly code: DiscordErrorCode,
    /** Détail technique, pour les journaux serveur uniquement. */
    detail?: string,
    /** Secondes à attendre avant de réessayer (code "rate_limited"). */
    readonly retryAfter?: number,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "DiscordError";
  }
}

export function isDiscordErrorCode(value: unknown): value is DiscordErrorCode {
  return typeof value === "string" && Object.hasOwn(DISCORD_ERROR_MESSAGES, value);
}

export const discordErrorMessage = (code: DiscordErrorCode) => DISCORD_ERROR_MESSAGES[code];

/** Statut HTTP renvoyé par les routes API pour chaque code. */
export function httpStatusOf(code: DiscordErrorCode): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "invalid_channel":
    case "invalid_message":
    case "bad_request":
    case "rejected":
      return 400;
    case "project_not_found":
    case "not_linked":
    case "channel_not_found":
      return 404;
    case "rate_limited":
      return 429;
    case "not_configured":
      return 503;
    case "unknown":
      return 500;
    default:
      // Erreur venue de Discord (accès, permissions, panne) : « mauvaise passerelle ».
      return 502;
  }
}
