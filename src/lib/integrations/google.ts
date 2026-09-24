/**
 * Client Google : OAuth 2.0 et API Drive v3, en appels REST directs.
 *
 * Pas de SDK : `googleapis` pèse plus de 100 Mo et ralentit les démarrages à froid, pour
 * cinq points d'entrée seulement. Toute réponse d'erreur est convertie en IntegrationError.
 */
import "server-only";
import { hasEncryptionKey } from "@/lib/crypto";
import { IntegrationError } from "./errors";

/** Lecture seule sur Drive : suffit pour lire titre, lien et date de modification. */
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE_URL = "https://www.googleapis.com/drive/v3";

const TIMEOUT_MS = 10_000;
/** Une seule nouvelle tentative sur 429 / 5xx : au-delà, l'utilisateur attend trop. */
const MAX_RETRIES = 1;

// trim() : une variable collée dans Vercel peut garder un retour à la ligne final.
const env = (name: string) => process.env[name]?.trim() || undefined;

type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Configuration OAuth, ou null si une variable manque (l'intégration est alors désactivée). */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = env("GOOGLE_CLIENT_ID");
  const clientSecret = env("GOOGLE_CLIENT_SECRET");
  const appUrl = env("APP_URL")?.replace(/\/+$/, "");
  if (!clientId || !clientSecret || !appUrl || !hasEncryptionKey()) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/integrations/google/callback` };
}

export const isGoogleConfigured = () => getGoogleConfig() !== null;

function requireConfig(): GoogleConfig {
  const config = getGoogleConfig();
  if (!config) throw new IntegrationError("not_configured");
  return config;
}

// OAuth

export type GoogleTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string };

export function buildAuthUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): string {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    // "offline" pour obtenir un refresh token ; Google ne le renvoie qu'au premier consentement,
    // "consent" le redemande à chaque connexion. "select_account" laisse choisir le compte.
    access_type: "offline",
    prompt: "select_account consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

/** L'écran de consentement permet de décocher un scope : on vérifie ce qui a été accordé. */
export const hasDriveScope = (scope: string) => scope.split(" ").includes(GOOGLE_SCOPE);

export function exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokens> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: requireConfig().redirectUri,
  });
}

/** Lève `reauth_required` si le refresh token a été révoqué ou a expiré. */
export function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Révoque l'accès chez Google (le refresh token révoque toute l'autorisation). Sans échec bloquant. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await send(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch (e) {
    console.warn("[integrations] révocation Google impossible", e);
  }
}

async function tokenRequest(params: Record<string, string>): Promise<GoogleTokens> {
  const { clientId, clientSecret } = requireConfig();
  const res = await send(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  const body = (await readJson(res)) as Record<string, unknown> | null;

  if (res.ok && typeof body?.access_token === "string") {
    return {
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
      expiresAt: new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000),
      scope: typeof body.scope === "string" ? body.scope : "",
    };
  }
  const error = typeof body?.error === "string" ? body.error : "";
  // invalid_grant : code déjà utilisé ou expiré, refresh token révoqué ou expiré.
  if (error === "invalid_grant") throw new IntegrationError("reauth_required", `invalid_grant ${body?.error_description ?? ""}`);
  if (error === "invalid_client" || error === "unauthorized_client") throw new IntegrationError("misconfigured", error);
  throw toIntegrationError(res.status, body);
}

// Drive

export type GoogleAccount = { id: string; email: string };

export type GoogleDoc = {
  id: string;
  title: string;
  url: string;
  modifiedAt: Date | null;
  trashed: boolean;
  lastModifiedBy: string | null;
};

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  trashed?: boolean;
  lastModifyingUser?: { displayName?: string };
};

const FILE_FIELDS = "id,name,mimeType,webViewLink,modifiedTime,trashed,lastModifyingUser(displayName)";

/** Identité du compte connecté (sans scope supplémentaire : `about` est lisible avec drive.readonly). */
export async function getAccount(accessToken: string): Promise<GoogleAccount> {
  const body = await drive<{ user?: { permissionId?: string; emailAddress?: string } }>(accessToken, "/about", {
    fields: "user(permissionId,emailAddress)",
  });
  if (!body.user?.permissionId) throw new IntegrationError("unknown", "about.get sans permissionId");
  return { id: body.user.permissionId, email: body.user.emailAddress ?? "" };
}

/** Métadonnées d'un Google Doc. Lève `not_a_doc` pour tout autre type de fichier. */
export async function getDoc(accessToken: string, fileId: string): Promise<GoogleDoc> {
  const file = await drive<DriveFile>(accessToken, `/files/${encodeURIComponent(fileId)}`, {
    fields: FILE_FIELDS,
    supportsAllDrives: "true",
  });
  if (file.mimeType !== GOOGLE_DOC_MIME) throw new IntegrationError("not_a_doc", file.mimeType);
  return toDoc(file);
}

/** Google Docs de l'utilisateur dont le nom contient `query` (tous si vide), les plus récents d'abord. */
export async function searchDocs(accessToken: string, query: string): Promise<GoogleDoc[]> {
  const clauses = [`mimeType='${GOOGLE_DOC_MIME}'`, "trashed=false"];
  if (query.trim()) clauses.push(`name contains '${escapeQuery(query.trim())}'`);
  const body = await drive<{ files?: DriveFile[] }>(accessToken, "/files", {
    q: clauses.join(" and "),
    orderBy: "modifiedTime desc",
    pageSize: "20",
    fields: `files(${FILE_FIELDS})`,
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  return (body.files ?? []).map(toDoc);
}

/**
 * Contenu complet d'un Google Doc au format Markdown (titres, listes, tableaux, liens ; les
 * images sont intégrées en base64). Google limite l'export à 10 Mo : au-delà, `too_large`.
 */
export async function exportDocMarkdown(accessToken: string, fileId: string): Promise<string> {
  const res = await driveRequest(accessToken, `/files/${encodeURIComponent(fileId)}/export`, { mimeType: "text/markdown" });
  return res.text();
}

function toDoc(file: DriveFile): GoogleDoc {
  return {
    id: file.id,
    title: file.name || "Sans titre",
    // Le lien est affiché tel quel dans un <a href> : on n'accepte que du https.
    url: file.webViewLink?.startsWith("https://") ? file.webViewLink : `https://docs.google.com/document/d/${file.id}/edit`,
    modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
    trashed: file.trashed ?? false,
    lastModifiedBy: file.lastModifyingUser?.displayName ?? null,
  };
}

/** Échappement des chaînes dans le paramètre `q` de l'API Drive. */
const escapeQuery = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// HTTP

async function driveRequest(accessToken: string, path: string, params: Record<string, string>): Promise<Response> {
  const res = await send(`${DRIVE_URL}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw toIntegrationError(res.status, await readJson(res));
  return res;
}

async function drive<T>(accessToken: string, path: string, params: Record<string, string>): Promise<T> {
  return (await (await driveRequest(accessToken, path, params)).json()) as T;
}

/** fetch avec délai maximal, et une nouvelle tentative sur 429 / 5xx. */
async function send(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new IntegrationError("network", e instanceof Error ? e.message : String(e));
  }
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
    await new Promise((resolve) => setTimeout(resolve, retryDelay(res, attempt)));
    return send(url, init, attempt + 1);
  }
  return res;
}

/** Délai demandé par Google (Retry-After), plafonné à 2 s ; sinon attente exponentielle. */
function retryDelay(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  return Math.min(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt, 2000);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Raisons d'erreur Drive signifiant un dépassement de quota (renvoyées en 403 comme en 429). */
const QUOTA_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "sharingRateLimitExceeded",
  "RATE_LIMIT_EXCEEDED",
]);
/** Le jeton n'a pas le scope nécessaire (case décochée à l'écran de consentement). */
const SCOPE_REASONS = new Set(["insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"]);
/** L'API Drive n'est pas activée dans le projet Google Cloud. */
const SETUP_REASONS = new Set(["accessNotConfigured", "SERVICE_DISABLED"]);
/** Export au-delà de la limite de 10 Mo. */
const SIZE_REASONS = new Set(["exportSizeLimitExceeded"]);

/** Traduit une réponse d'erreur de l'API Google en IntegrationError. */
export function toIntegrationError(status: number, body: unknown): IntegrationError {
  const reasons = errorReasons(body);
  const detail = `HTTP ${status} ${reasons.join(",")}`.trim();
  const has = (set: Set<string>) => reasons.some((r) => set.has(r));

  if (status === 401) return new IntegrationError("unauthorized", detail);
  if (status === 429 || has(QUOTA_REASONS)) return new IntegrationError("quota", detail);
  if (status === 403 && has(SETUP_REASONS)) return new IntegrationError("misconfigured", detail);
  if (status === 403 && has(SIZE_REASONS)) return new IntegrationError("too_large", detail);
  if (status === 403 && has(SCOPE_REASONS)) return new IntegrationError("missing_scope", detail);
  if (status === 403) return new IntegrationError("forbidden", detail);
  if (status === 404) return new IntegrationError("not_found", detail);
  if (status >= 500) return new IntegrationError("unavailable", detail);
  return new IntegrationError("unknown", detail);
}

/**
 * Raisons d'une erreur Google. Deux formats coexistent :
 * { error: { errors: [{ reason }] } } (historique) et { error: { details: [{ reason }] } }.
 */
function errorReasons(body: unknown): string[] {
  const error = (body as { error?: unknown } | null)?.error;
  if (!error || typeof error !== "object") return [];
  const { errors, details } = error as { errors?: unknown; details?: unknown };
  return [errors, details]
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .map((item) => (item as { reason?: unknown } | null)?.reason)
    .filter((reason): reason is string => typeof reason === "string");
}
