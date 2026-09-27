/**
 * Envoi d'emails par Resend, en un seul point pour toute l'application.
 *
 * Configuration : RESEND_API_KEY, EMAIL_FROM_DOMAIN (domaine vérifié dans Resend : les emails
 * partent de noreply@<domaine>) et APP_URL (adresse publique, pour les liens des emails).
 *
 * - Jamais d'exception : le résultat dit si l'email est parti, avec un code d'erreur sinon
 *   (traduit en message par `emailErrorMessage`). Chaque échec est journalisé, sans le contenu de
 *   l'email (il contient des liens à usage unique).
 * - Hors production, sans RESEND_API_KEY : l'email est écrit dans la console du serveur au lieu
 *   d'être envoyé, pour pouvoir tester l'inscription en local.
 */
import "server-only";
import { Resend } from "resend";

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export type EmailErrorCode = "not_configured" | "quota" | "rejected" | "unavailable";
export type SendResult = { ok: true } | { ok: false; code: EmailErrorCode };

const MESSAGES: Record<EmailErrorCode, string> = {
  not_configured: "L'envoi d'emails n'est pas configuré sur ce serveur. Prévenez un administrateur.",
  quota: "Le service d'envoi d'emails a atteint sa limite. Réessayez dans quelques minutes.",
  rejected: "L'email a été refusé par le service d'envoi. Vérifiez l'adresse, ou prévenez un administrateur.",
  unavailable: "Le service d'envoi d'emails ne répond pas. Réessayez dans quelques minutes.",
};

export const emailErrorMessage = (code: EmailErrorCode) => MESSAGES[code];

/** Mot de passe oublié sans envoi d'emails : seul un administrateur peut le réinitialiser (/membres). */
export const RESET_BY_ADMIN =
  "La réinitialisation par email n'est pas disponible : demandez à un administrateur de GePro de réinitialiser votre mot de passe.";

const env = (name: string) => process.env[name]?.trim() || null;

/** Adresse publique de l'application, sans / final. Hors production, http://localhost:3000 par défaut. */
export function appUrl(): string | null {
  const url = env("APP_URL")?.replace(/\/+$/, "");
  if (url) return url;
  // En production, jamais déduite de l'en-tête Host : un lien de réinitialisation pourrait
  // alors pointer vers un site choisi par un attaquant.
  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

/**
 * Envoi d'emails possible. En production : RESEND_API_KEY, EMAIL_FROM_DOMAIN et APP_URL renseignées.
 * Hors production : toujours (sans clé, les emails sont écrits dans la console).
 *
 * Sans envoi d'emails, la vérification d'adresse est impossible : l'application s'en passe
 * (voir actions/project-members.ts) et le mot de passe oublié passe par un administrateur.
 */
export function isEmailEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(env("RESEND_API_KEY") && env("EMAIL_FROM_DOMAIN") && appUrl());
}

/** Code d'erreur Resend → catégorie montrée à l'utilisateur. */
function categorize(name: string): EmailErrorCode {
  if (["monthly_quota_exceeded", "daily_quota_exceeded", "rate_limit_exceeded"].includes(name)) return "quota";
  if (["missing_api_key", "invalid_api_key", "restricted_api_key", "invalid_from_address", "invalid_access"].includes(name)) {
    return "not_configured";
  }
  if (["validation_error", "invalid_parameter", "missing_required_field"].includes(name)) return "rejected";
  return "unavailable";
}

function logFailure(code: EmailErrorCode, detail: string, subject: string) {
  console.error(`[email] échec d'envoi (${code}) : ${detail} — « ${subject} »`);
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = env("RESEND_API_KEY");
  const domain = env("EMAIL_FROM_DOMAIN");

  if (!apiKey || !domain || !appUrl()) {
    if (process.env.NODE_ENV !== "production" && !apiKey) {
      console.info(`[email] (non envoyé, RESEND_API_KEY absente) à ${message.to} — ${message.subject}\n${message.text}`);
      return { ok: true };
    }
    logFailure("not_configured", "RESEND_API_KEY, EMAIL_FROM_DOMAIN ou APP_URL manquante", message.subject);
    return { ok: false, code: "not_configured" };
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `GePro <noreply@${domain}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (!error) return { ok: true };
    const code = categorize(error.name);
    logFailure(code, `${error.name} (${error.statusCode ?? "?"}) ${error.message}`, message.subject);
    return { ok: false, code };
  } catch (err) {
    logFailure("unavailable", err instanceof Error ? err.message : String(err), message.subject);
    return { ok: false, code: "unavailable" };
  }
}
