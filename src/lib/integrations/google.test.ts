import { afterEach, describe, expect, it } from "vitest";
import { DOC_ID, driveError, driveFile, json, mockFetch, mockGoogle } from "@/test/google";
import type { IntegrationErrorCode } from "./errors";
import {
  buildAuthUrl,
  exportDocMarkdown,
  getDoc,
  getGoogleConfig,
  GOOGLE_SCOPE,
  hasDriveScope,
  refreshAccessToken,
  searchDocs,
  toIntegrationError,
} from "./google";

/** Code de l'IntegrationError levée par une promesse. */
const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (e: { code?: IntegrationErrorCode }) => e.code,
  );

describe("configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("construit l'URI de redirection à partir de APP_URL, espaces et / final ignorés", () => {
    process.env.APP_URL = " https://gepro.example.com/ \n";
    expect(getGoogleConfig()?.redirectUri).toBe("https://gepro.example.com/api/integrations/google/callback");
  });

  it.each(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL", "INTEGRATIONS_ENCRYPTION_KEY"])(
    "désactive l'intégration sans %s",
    (name) => {
      process.env[name] = "";
      expect(getGoogleConfig()).toBeNull();
    },
  );

  it("demande le scope drive.readonly, un refresh token et PKCE", () => {
    const url = new URL(buildAuthUrl({ state: "etat", codeChallenge: "defi" }));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toContain("consent");
    expect(url.searchParams.get("state")).toBe("etat");
    expect(url.searchParams.get("code_challenge")).toBe("defi");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("vérifie que drive.readonly a bien été accordé", () => {
    expect(hasDriveScope(`openid ${GOOGLE_SCOPE}`)).toBe(true);
    expect(hasDriveScope("https://www.googleapis.com/auth/drive.file")).toBe(false);
  });
});

describe("traduction des erreurs Google", () => {
  const withReasons = (key: "errors" | "details", reason: string) => ({ error: { [key]: [{ reason }] } });

  it.each<[number, unknown, IntegrationErrorCode]>([
    [401, null, "unauthorized"],
    [429, null, "quota"],
    [403, withReasons("errors", "userRateLimitExceeded"), "quota"],
    [403, withReasons("errors", "dailyLimitExceeded"), "quota"],
    [403, withReasons("details", "RATE_LIMIT_EXCEEDED"), "quota"],
    [403, withReasons("errors", "insufficientPermissions"), "missing_scope"],
    [403, withReasons("details", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"), "missing_scope"],
    [403, withReasons("errors", "accessNotConfigured"), "misconfigured"],
    [403, withReasons("errors", "exportSizeLimitExceeded"), "too_large"],
    [403, withReasons("errors", "insufficientFilePermissions"), "forbidden"],
    [403, "<html>", "forbidden"],
    [404, withReasons("errors", "notFound"), "not_found"],
    [500, null, "unavailable"],
    [503, null, "unavailable"],
    [400, withReasons("errors", "invalid"), "unknown"],
  ])("HTTP %i %j → %s", (status, body, expected) => {
    expect(toIntegrationError(status, body).code).toBe(expected);
  });
});

describe("appels à Google", () => {
  it("lit les métadonnées d'un Google Doc", async () => {
    const calls = mockGoogle();
    const doc = await getDoc("jeton", DOC_ID);
    expect(doc).toEqual({
      id: DOC_ID,
      title: "Cahier des charges",
      url: `https://docs.google.com/document/d/${DOC_ID}/edit`,
      modifiedAt: new Date("2026-09-20T12:30:00.000Z"),
      trashed: false,
      lastModifiedBy: "Léa Dubois",
    });
    expect(calls[0].headers.get("authorization")).toBe("Bearer jeton");
  });

  it("refuse un fichier qui n'est pas un Google Doc", async () => {
    mockGoogle({ file: () => json(driveFile({ mimeType: "application/vnd.google-apps.spreadsheet" })) });
    expect(await codeOf(getDoc("jeton", DOC_ID))).toBe("not_a_doc");
  });

  it("n'utilise que des liens https", async () => {
    mockGoogle({ file: () => json(driveFile({ webViewLink: "javascript:alert(1)" })) });
    expect((await getDoc("jeton", DOC_ID)).url).toBe(`https://docs.google.com/document/d/${DOC_ID}/edit`);
  });

  it("échappe la recherche et se limite aux Google Docs hors corbeille", async () => {
    const calls = mockGoogle();
    await searchDocs("jeton", "l'offre \\ 2026");
    const q = calls[0].url.searchParams.get("q");
    expect(q).toContain("mimeType='application/vnd.google-apps.document'");
    expect(q).toContain("trashed=false");
    expect(q).toContain("name contains 'l\\'offre \\\\ 2026'");
  });

  it("réessaie une fois sur une erreur 5xx", async () => {
    let attempts = 0;
    mockGoogle({ file: () => (++attempts === 1 ? json({}, 503) : json(driveFile())) });
    expect((await getDoc("jeton", DOC_ID)).title).toBe("Cahier des charges");
    expect(attempts).toBe(2);
  });

  it("abandonne après une seconde erreur 429", async () => {
    const calls = mockGoogle({ file: () => json({}, 429, { "retry-after": "0.01" }) });
    expect(await codeOf(getDoc("jeton", DOC_ID))).toBe("quota");
    expect(calls).toHaveLength(2);
  });

  it("signale les droits insuffisants et les quotas renvoyés en 403", async () => {
    mockGoogle({ file: () => driveError(403, "insufficientFilePermissions") });
    expect(await codeOf(getDoc("jeton", DOC_ID))).toBe("forbidden");
    mockGoogle({ file: () => driveError(403, "userRateLimitExceeded") });
    expect(await codeOf(getDoc("jeton", DOC_ID))).toBe("quota");
  });

  it("traduit une panne réseau", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await codeOf(getDoc("jeton", DOC_ID))).toBe("network");
  });

  it("traduit un refresh token révoqué ou expiré (invalid_grant)", async () => {
    mockGoogle({ token: () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400) });
    expect(await codeOf(refreshAccessToken("refresh"))).toBe("reauth_required");
  });

  it("exporte le contenu complet d'un Google Doc en Markdown", async () => {
    const calls = mockGoogle();
    expect(await exportDocMarkdown("jeton", DOC_ID)).toContain("Objectif : **refondre** le site.");
    expect(calls[0].url.pathname).toBe(`/drive/v3/files/${DOC_ID}/export`);
    expect(calls[0].url.searchParams.get("mimeType")).toBe("text/markdown");
    expect(calls[0].headers.get("authorization")).toBe("Bearer jeton");
  });

  it("signale un document trop volumineux pour l'export (10 Mo)", async () => {
    mockGoogle({ export: () => driveError(403, "exportSizeLimitExceeded") });
    expect(await codeOf(exportDocMarkdown("jeton", DOC_ID))).toBe("too_large");
  });

  it("signale un document supprimé pendant l'export", async () => {
    mockGoogle({ export: () => driveError(404, "notFound") });
    expect(await codeOf(exportDocMarkdown("jeton", DOC_ID))).toBe("not_found");
  });

  it("signale des identifiants OAuth invalides (invalid_client)", async () => {
    mockGoogle({ token: () => json({ error: "invalid_client" }, 401) });
    expect(await codeOf(refreshAccessToken("refresh"))).toBe("misconfigured");
  });

  it("envoie les identifiants du client et le refresh token", async () => {
    const calls = mockGoogle();
    const tokens = await refreshAccessToken("refresh-1");
    expect(tokens.accessToken).toBe("access-refreshed");
    expect(tokens.refreshToken).toBeNull();
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3_500_000);
    expect(Object.fromEntries(calls[0].body!)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "refresh-1",
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    });
  });
});
