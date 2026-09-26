/**
 * Noms d'utilisateur : format, noms réservés, et proposition à partir du nom ou de l'email.
 * L'unicité ne tient pas compte de la casse (index sur lower(username)).
 *
 * `suggestUsername` suit les mêmes règles que la migration 0013 pour les comptes existants
 * (vérifié par usernames.test.ts) : garder les deux en accord.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;

/** Même liste que dans drizzle/0013_comptes_utilisateurs.sql. */
export const RESERVED_USERNAMES: readonly string[] = [
  "admin", "administrateur", "administrator", "api", "www", "support", "root", "system", "systeme",
  "gepro", "help", "aide", "contact", "info", "mail", "email", "noreply", "no-reply", "security",
  "securite", "staff", "team", "equipe", "owner", "proprietaire", "moderateur", "moderator",
  "null", "undefined", "anonymous", "anonyme", "me", "moi", "login", "logout", "connexion",
  "deconnexion", "inscription", "invitations", "membres", "projets", "parametres", "settings",
];

export const isReservedUsername = (username: string) => RESERVED_USERNAMES.includes(username.toLowerCase());

/** Message d'erreur du format, ou null si le nom est bien formé (sans vérifier sa disponibilité). */
export function usernameFormatError(username: string): string | null {
  if (username.length < USERNAME_MIN) return `${USERNAME_MIN} caractères minimum`;
  if (username.length > USERNAME_MAX) return `${USERNAME_MAX} caractères maximum`;
  if (!USERNAME_PATTERN.test(username)) return "Lettres, chiffres, _ et - uniquement";
  if (isReservedUsername(username)) return "Ce nom d'utilisateur est réservé";
  return null;
}

const ACCENTS: Record<string, string> = {
  à: "a", â: "a", ä: "a", á: "a", ã: "a", å: "a", ç: "c", é: "e", è: "e", ê: "e", ë: "e", í: "i", ì: "i", î: "i", ï: "i",
  ñ: "n", ó: "o", ò: "o", ô: "o", ö: "o", õ: "o", ú: "u", ù: "u", û: "u", ü: "u", ý: "y", ÿ: "y", æ: "ae", œ: "oe",
};

const trimDashes = (s: string) => s.replace(/^-+|-+$/g, "");

/** « Camille Martin » → « camille-martin » ; chaîne vide si moins de 3 caractères utiles. */
function slug(source: string): string {
  const plain = [...source.toLowerCase()].map((c) => ACCENTS[c] ?? c).join("");
  const s = trimDashes(trimDashes(plain.replace(/[^a-z0-9]+/g, "-")).slice(0, USERNAME_MAX));
  return s.length >= USERNAME_MIN ? s : "";
}

/**
 * Nom d'utilisateur libre proposé à partir du nom, sinon de la partie locale de l'email, sinon
 * « membre » ; suffixe -2, -3… si déjà pris ou réservé. `isTaken` compare sans tenir compte de la casse.
 */
export async function suggestUsername(
  name: string,
  email: string,
  isTaken: (candidate: string) => boolean | Promise<boolean>,
): Promise<string> {
  const base = slug(name) || slug(email.split("@")[0] ?? "") || "membre";
  let candidate = base;
  for (let n = 2; isReservedUsername(candidate) || (await isTaken(candidate)); n++) {
    candidate = `${trimDashes(base.slice(0, USERNAME_MAX - 1 - String(n).length))}-${n}`;
  }
  return candidate;
}
