/**
 * Faux Google pour les tests : remplace fetch et répond aux points d'entrée utilisés par
 * l'application. Chaque route peut être remplacée pour simuler une erreur.
 */
import { vi } from "vitest";
import { GOOGLE_DOC_MIME, GOOGLE_SCOPE } from "@/lib/integrations/google";

export const DOC_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

/** Contenu renvoyé par l'export Markdown simulé. */
export const DOC_MARKDOWN = "# Cahier des charges\n\nObjectif : **refondre** le site.\n";

export type FetchCall = { url: URL; method: string; body: URLSearchParams | null; headers: Headers };
type Route = (call: FetchCall) => Response | Promise<Response>;
type GoogleRoutes = {
  token: Route;
  revoke: Route;
  about: Route;
  search: Route;
  file: (id: string, call: FetchCall) => Response | Promise<Response>;
  export: (id: string, call: FetchCall) => Response | Promise<Response>;
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** Erreur au format de l'API Drive. */
export const driveError = (status: number, reason: string) =>
  json({ error: { code: status, message: reason, errors: [{ domain: "global", reason, message: reason }] } }, status);

export const driveFile = (overrides: Record<string, unknown> = {}) => ({
  id: DOC_ID,
  name: "Cahier des charges",
  mimeType: GOOGLE_DOC_MIME,
  webViewLink: `https://docs.google.com/document/d/${DOC_ID}/edit`,
  modifiedTime: "2026-09-20T12:30:00.000Z",
  trashed: false,
  lastModifyingUser: { displayName: "Léa Dubois" },
  ...overrides,
});

export const tokenResponse = (overrides: Record<string, unknown> = {}) =>
  json({ access_token: "access-refreshed", expires_in: 3599, scope: GOOGLE_SCOPE, token_type: "Bearer", ...overrides });

/** Remplace fetch ; renvoie la liste des appels reçus. */
export function mockFetch(handler: Route): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call: FetchCall = {
        url: new URL(input instanceof Request ? input.url : String(input)),
        method: init?.method ?? "GET",
        body: init?.body instanceof URLSearchParams ? init.body : null,
        headers: new Headers(init?.headers),
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

export function mockGoogle(routes: Partial<GoogleRoutes> = {}): FetchCall[] {
  const r: GoogleRoutes = {
    token: () => tokenResponse(),
    revoke: () => new Response(null, { status: 200 }),
    about: () => json({ user: { permissionId: "perm-1", emailAddress: "camille@gmail.com" } }),
    search: () => json({ files: [driveFile()] }),
    file: (id) => json(driveFile({ id })),
    export: () => new Response(DOC_MARKDOWN, { headers: { "content-type": "text/markdown" } }),
    ...routes,
  };
  return mockFetch((call) => {
    const { hostname, pathname } = call.url;
    if (hostname === "oauth2.googleapis.com" && pathname === "/token") return r.token(call);
    if (hostname === "oauth2.googleapis.com" && pathname === "/revoke") return r.revoke(call);
    if (pathname === "/drive/v3/about") return r.about(call);
    if (pathname === "/drive/v3/files") return r.search(call);
    const fileId = pathname.match(/^\/drive\/v3\/files\/([^/]+)$/)?.[1];
    if (fileId) return r.file(decodeURIComponent(fileId), call);
    const exportId = pathname.match(/^\/drive\/v3\/files\/([^/]+)\/export$/)?.[1];
    if (exportId) return r.export(decodeURIComponent(exportId), call);
    throw new Error(`Appel Google inattendu : ${call.method} ${call.url}`);
  });
}
