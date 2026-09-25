import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { externalConnections } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { saveGoogleConnection } from "@/lib/integrations/connections";
import { CALENDAR_SCOPE, GOOGLE_SCOPE } from "@/lib/integrations/google";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { json, mockGoogle, tokenResponse } from "@/test/google";
import { GET as callback } from "./callback/route";
import { GET as connect } from "./connect/route";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));

// Cookies du navigateur, simulés.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

// redirect() interrompt le rendu en levant une exception : on la capture pour lire l'URL.
class Redirect extends Error {
  constructor(readonly url: string) {
    super(url);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof Redirect) return e.url;
    throw e;
  }
  throw new Error("Aucune redirection");
}

const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);

let projectId: string;
let userId: string;

beforeEach(async () => {
  jar.clear();
  await resetDb(db);
  const user = await insertUser(db);
  userId = user.id;
  projectId = (await insertProject(db)).id;
  vi.mocked(requireUser).mockResolvedValue({ ...user, role: "member" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** Démarre la connexion ; renvoie les paramètres envoyés à Google. */
async function startConnect() {
  const url = new URL(await redirectOf(() => connect(request(`/api/integrations/google/connect?projectId=${projectId}`))));
  expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  return url.searchParams;
}

const settingsUrl = () => `/projets/${projectId}/parametres`;

describe("connexion OAuth Google", () => {
  it("parcours complet : state vérifié, PKCE, jetons chiffrés, retour sur les paramètres du projet", async () => {
    const google = await startConnect();
    const calls = mockGoogle({ token: () => tokenResponse({ access_token: "access-1", refresh_token: "refresh-1" }) });

    const location = await redirectOf(() =>
      callback(request(`/api/integrations/google/callback?state=${google.get("state")}&code=code-google`)),
    );

    expect(location).toBe(`${settingsUrl()}?google=connected`);

    // PKCE : le verifier envoyé à l'échange correspond au défi transmis au départ.
    const tokenCall = calls.find((c) => c.url.pathname === "/token")!;
    const verifier = tokenCall.body!.get("code_verifier")!;
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(google.get("code_challenge"));
    expect(tokenCall.body!.get("code")).toBe("code-google");

    const [row] = await db.select().from(externalConnections);
    expect(row).toMatchObject({ userId, provider: "google", accountEmail: "camille@gmail.com", status: "active" });
    expect(decryptSecret(row.accessTokenEnc!)).toBe("access-1");
    expect(decryptSecret(row.refreshTokenEnc!)).toBe("refresh-1");

    // Le cookie temporaire est à usage unique.
    expect(jar.size).toBe(0);
  });

  it("refuse un state qui ne correspond pas (requête forgée)", async () => {
    await startConnect();
    const calls = mockGoogle();
    const location = await redirectOf(() => callback(request("/api/integrations/google/callback?state=autre&code=code-google")));
    expect(location).toBe(`${settingsUrl()}?google=error&reason=invalid_state`);
    expect(calls).toHaveLength(0);
    expect(await db.select().from(externalConnections)).toHaveLength(0);
  });

  it("refuse un retour sans connexion démarrée (cookie absent ou expiré)", async () => {
    const location = await redirectOf(() => callback(request("/api/integrations/google/callback?state=x&code=y")));
    expect(location).toBe("/projets?google=error&reason=invalid_state");
  });

  it("gère le refus de l'utilisateur sur l'écran de consentement", async () => {
    const google = await startConnect();
    const location = await redirectOf(() =>
      callback(request(`/api/integrations/google/callback?state=${google.get("state")}&error=access_denied`)),
    );
    expect(location).toBe(`${settingsUrl()}?google=error&reason=access_denied`);
  });

  it("refuse une autorisation sans drive.readonly (case décochée) et la révoque", async () => {
    const google = await startConnect();
    const calls = mockGoogle({ token: () => tokenResponse({ scope: "openid", refresh_token: "refresh-1" }) });
    const location = await redirectOf(() =>
      callback(request(`/api/integrations/google/callback?state=${google.get("state")}&code=c`)),
    );
    expect(location).toBe(`${settingsUrl()}?google=error&reason=missing_scope`);
    expect(calls.find((c) => c.url.pathname === "/revoke")?.body?.get("token")).toBe("refresh-1");
    expect(await db.select().from(externalConnections)).toHaveLength(0);
  });

  it("agenda : demande le seul droit Agenda (plus l'identité) et revient sur le calendrier", async () => {
    const url = new URL(await redirectOf(() => connect(request("/api/integrations/google/connect?agenda=1"))));
    expect(url.searchParams.get("scope")).toBe(`${CALENDAR_SCOPE} openid email`);
    // Autorisation incrémentale : un accès Drive déjà accordé est conservé.
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");

    const calls = mockGoogle({ token: () => tokenResponse({ scope: `${CALENDAR_SCOPE} openid https://www.googleapis.com/auth/userinfo.email` }) });
    const location = await redirectOf(() =>
      callback(request(`/api/integrations/google/callback?state=${url.searchParams.get("state")}&code=c`)),
    );
    expect(location).toBe("/calendrier?google=connected");
    // Sans Drive, l'identité du compte vient d'OpenID.
    expect(calls.some((c) => c.url.pathname === "/v1/userinfo")).toBe(true);
    const [row] = await db.select().from(externalConnections);
    expect(row).toMatchObject({ accountId: "sub-1", accountEmail: "camille@gmail.com" });
    expect(row.scopes).toContain(CALENDAR_SCOPE);
  });

  it("agenda refusé : message dédié, sans révoquer l'accès Drive déjà accordé", async () => {
    await saveGoogleConnection(
      userId,
      { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3_600_000), scope: GOOGLE_SCOPE },
      { id: "perm-1", email: "camille@gmail.com" },
    );
    const url = new URL(await redirectOf(() => connect(request("/api/integrations/google/connect?agenda=1"))));
    const calls = mockGoogle({ token: () => tokenResponse({ scope: GOOGLE_SCOPE, refresh_token: "refresh-2" }) });
    const location = await redirectOf(() =>
      callback(request(`/api/integrations/google/callback?state=${url.searchParams.get("state")}&code=c`)),
    );
    expect(location).toBe("/calendrier?google=error&reason=missing_calendar_scope");
    expect(calls.some((c) => c.url.pathname === "/revoke")).toBe(false);
    const [row] = await db.select().from(externalConnections);
    expect(decryptSecret(row.refreshTokenEnc!)).toBe("r");
  });

  it("code expiré ou déjà utilisé : invite à recommencer", async () => {
    const google = await startConnect();
    mockGoogle({ token: () => json({ error: "invalid_grant" }, 400) });
    const location = await redirectOf(() =>
      callback(request(`/api/integrations/google/callback?state=${google.get("state")}&code=c`)),
    );
    expect(location).toBe(`${settingsUrl()}?google=error&reason=invalid_state`);
  });

  it("API Drive non activée dans Google Cloud : message de configuration", async () => {
    const google = await startConnect();
    mockGoogle({ about: () => json({ error: { code: 403, errors: [{ reason: "accessNotConfigured" }] } }, 403) });
    const location = await redirectOf(() =>
      callback(request(`/api/integrations/google/callback?state=${google.get("state")}&code=c`)),
    );
    expect(location).toBe(`${settingsUrl()}?google=error&reason=misconfigured`);
  });

  it("ne redirige jamais vers une adresse fournie par la requête", async () => {
    const url = await redirectOf(() => connect(request("/api/integrations/google/connect?projectId=//evil.example.com")));
    expect(new URL(url).origin).toBe("https://accounts.google.com");
    expect(JSON.parse([...jar.values()][0]).returnTo).toBe("/projets");
  });

  it("intégration non configurée : retour immédiat avec un message", async () => {
    const saved = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "";
    try {
      const location = await redirectOf(() => connect(request(`/api/integrations/google/connect?projectId=${projectId}`)));
      expect(location).toBe(`${settingsUrl()}?google=error&reason=not_configured`);
    } finally {
      process.env.GOOGLE_CLIENT_ID = saved;
    }
  });
});
