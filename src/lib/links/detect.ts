/**
 * Analyse d'un lien utile : normalisation de l'adresse et reconnaissance du service (voir
 * registry.ts). Fonctions pures, utilisées côté serveur (validation) comme côté client (aperçu
 * en direct, icône de la barre latérale). L'icône n'est jamais stockée : elle est recalculée à
 * l'affichage, les liens existants profitent donc des ajouts au registre.
 */
import { LINK_SERVICES, type LinkService } from "./registry";

export type DetectedLink = {
  /** Adresse normalisée, à enregistrer et à ouvrir. */
  href: string;
  /** Domaine en minuscules, sans « www. » (titre par défaut, favicon). */
  domain: string;
  /** Service reconnu, ou null. */
  service: LinkService | null;
};

/** Un schéma explicite (« javascript: », « mailto: »…). « localhost:3000 » n'en est pas un (port). */
const SCHEME = /^([a-z][a-z0-9+.-]*):(?!\d)/i;

/**
 * Normalise une adresse saisie : `https://` ajouté s'il manque, domaine en minuscules. Renvoie
 * null si l'adresse est invalide, si son protocole n'est ni http ni https (`javascript:`,
 * `data:`, `mailto:`…) ou si elle contient des identifiants (`https://user@site`, souvent un
 * leurre : le vrai domaine est après l'arobase).
 */
export function normalizeLinkUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = SCHEME.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || url.username || url.password) return null;
  return url;
}

/** Domaine d'affichage : minuscules (fait par URL), sans « www. » ni point final. */
export function linkDomain(url: URL): string {
  return url.hostname.replace(/^www\./, "").replace(/\.$/, "");
}

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
const pathMatches = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

/** Service reconnu pour un domaine et un chemin : la règle la plus précise l'emporte. */
export function findService(domain: string, pathname: string): LinkService | null {
  let best: LinkService | null = null;
  let bestScore = -1;
  for (const service of LINK_SERVICES) {
    if (service.path && !pathMatches(pathname, service.path)) continue;
    for (const d of service.match) {
      if (!hostMatches(domain, d)) continue;
      // Un chemin compte plus que n'importe quelle longueur de domaine.
      const score = (service.path ? 1000 : 0) + d.length;
      if (score > bestScore) {
        best = service;
        bestScore = score;
      }
    }
  }
  return best;
}

/** Analyse une adresse saisie ; null si elle n'est pas acceptable (voir normalizeLinkUrl). */
export function detectLink(input: string): DetectedLink | null {
  const url = normalizeLinkUrl(input);
  if (!url) return null;
  const domain = linkDomain(url);
  return { href: url.href, domain, service: findService(domain, url.pathname) };
}

/** Titre par défaut : le nom du service reconnu, sinon le domaine. */
export function defaultLinkTitle(link: DetectedLink): string {
  return link.service?.name ?? link.domain;
}

/**
 * Favicon d'un site inconnu, servi par DuckDuckGo et chargé par le navigateur : le serveur de
 * GePro ne va jamais chercher une adresse saisie par un utilisateur (pas de risque de SSRF).
 */
export function faviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

/**
 * Sans favicon, DuckDuckGo répond 404 mais avec une image de remplacement (PNG 48 × 48) que le
 * navigateur affiche sans déclencher `onError`, et le statut HTTP n'est pas lisible depuis une
 * <img>. On la reconnaît donc à sa taille pour afficher notre icône générique à la place. Un
 * vrai favicon de 48 × 48, plus rare, prend aussi l'icône générique : sans gravité.
 */
export function isFaviconPlaceholder(width: number, height: number): boolean {
  return width === 48 && height === 48;
}
