/**
 * Reconnaissance des liens Google Docs collés par l'utilisateur.
 *
 * Sans dépendance serveur : utilisé à la fois pour valider la saisie dans le navigateur (retour
 * immédiat) et par la Server Action qui rattache le document (validation qui fait foi).
 */

const DRIVE_ID = /^[\w-]{20,}$/;

/**
 * Identifiant d'un Google Doc à partir d'un lien collé par l'utilisateur ou d'un identifiant brut.
 * Accepte docs.google.com/document/…/d/<id> et drive.google.com/file/d/<id> ou open?id=<id>.
 */
export function parseDocId(input: string): string | null {
  const value = input.trim();
  if (DRIVE_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname === "docs.google.com") {
    // Variantes : /document/d/<id>, /document/u/1/d/<id>, /a/<domaine>/document/d/<id>
    return url.pathname.match(/\/document\/(?:u\/\d+\/)?d\/([\w-]+)/)?.[1] ?? null;
  }
  if (url.hostname === "drive.google.com") {
    const fromPath = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]+)/)?.[1];
    if (fromPath) return fromPath;
    const id = url.searchParams.get("id");
    return id && DRIVE_ID.test(id) ? id : null;
  }
  return null;
}
