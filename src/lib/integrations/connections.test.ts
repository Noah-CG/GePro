import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { externalConnections, externalResources } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { DOC_ID, json, mockGoogle, tokenResponse } from "@/test/google";
import { deleteGoogleConnection, getConnection, saveGoogleConnection, withGoogleAccess } from "./connections";
import { IntegrationError } from "./errors";
import { GOOGLE_SCOPE } from "./google";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

beforeEach(() => resetDb(db));

const account = { id: "perm-1", email: "camille@gmail.com" };

/** Utilisateur avec une connexion Google dont le jeton d'accès expire dans `expiresInMs`. */
async function connectedUser(expiresInMs = 3_600_000) {
  const user = await insertUser(db);
  await saveGoogleConnection(
    user.id,
    { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: new Date(Date.now() + expiresInMs), scope: GOOGLE_SCOPE },
    account,
  );
  return { user, connection: (await getConnection(user.id, "google"))! };
}

const readRow = async (id: string) =>
  (await db.select().from(externalConnections).where(eq(externalConnections.id, id)))[0];

const rejectionCode = (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (e: IntegrationError) => e.code,
  );

describe("enregistrement d'une connexion", () => {
  it("chiffre les jetons en base", async () => {
    const { connection } = await connectedUser();
    const row = await readRow(connection.id);
    expect(row.accessTokenEnc).not.toContain("access-1");
    expect(row.refreshTokenEnc).not.toContain("refresh-1");
    expect(decryptSecret(row.accessTokenEnc!)).toBe("access-1");
    expect(decryptSecret(row.refreshTokenEnc!)).toBe("refresh-1");
    expect(row).toMatchObject({ status: "active", accountEmail: "camille@gmail.com", scopes: GOOGLE_SCOPE });
  });

  it("reconnexion du même compte sans nouveau refresh token : l'ancien est conservé", async () => {
    const { user, connection } = await connectedUser();
    await saveGoogleConnection(
      user.id,
      { accessToken: "access-2", refreshToken: null, expiresAt: new Date(Date.now() + 3_600_000), scope: GOOGLE_SCOPE },
      account,
    );
    const row = await readRow(connection.id);
    expect(decryptSecret(row.accessTokenEnc!)).toBe("access-2");
    expect(decryptSecret(row.refreshTokenEnc!)).toBe("refresh-1");
  });

  it("connexion d'un autre compte Google : l'ancien refresh token n'est pas réutilisé", async () => {
    const { user, connection } = await connectedUser();
    await saveGoogleConnection(
      user.id,
      { accessToken: "access-2", refreshToken: null, expiresAt: new Date(Date.now() + 3_600_000), scope: GOOGLE_SCOPE },
      { id: "perm-2", email: "autre@gmail.com" },
    );
    const row = await readRow(connection.id);
    expect(row.refreshTokenEnc).toBeNull();
    expect(row.accountEmail).toBe("autre@gmail.com");
  });

  it("une reconnexion après « needs_reauth » réactive la connexion", async () => {
    const { user, connection } = await connectedUser();
    await db.update(externalConnections).set({ status: "needs_reauth", accessTokenEnc: null, refreshTokenEnc: null });
    await saveGoogleConnection(
      user.id,
      { accessToken: "access-2", refreshToken: "refresh-2", expiresAt: new Date(Date.now() + 3_600_000), scope: GOOGLE_SCOPE },
      account,
    );
    expect((await readRow(connection.id)).status).toBe("active");
  });

  it("déconnexion : révoque chez Google, supprime la connexion, garde les documents", async () => {
    const { user, connection } = await connectedUser();
    const project = await insertProject(db);
    await db.insert(externalResources).values({
      projectId: project.id,
      provider: "google",
      kind: "google_doc",
      externalId: DOC_ID,
      title: "Doc",
      url: "https://docs.google.com/document/d/x/edit",
      connectionId: connection.id,
      attachedBy: user.id,
    });
    const calls = mockGoogle();

    await deleteGoogleConnection(connection);

    expect(calls[0].url.pathname).toBe("/revoke");
    expect(calls[0].body?.get("token")).toBe("refresh-1");
    expect(await getConnection(user.id, "google")).toBeNull();
    const [resource] = await db.select().from(externalResources);
    expect(resource.connectionId).toBeNull();

    // En se reconnectant, l'utilisateur récupère la synchronisation de ses documents.
    await saveGoogleConnection(
      user.id,
      { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3_600_000), scope: GOOGLE_SCOPE },
      account,
    );
    const newConnection = await getConnection(user.id, "google");
    const [relinked] = await db.select().from(externalResources);
    expect(relinked.connectionId).toBe(newConnection!.id);
  });
});

describe("withGoogleAccess", () => {
  it("utilise le jeton d'accès encore valide, sans appel à Google", async () => {
    const { connection } = await connectedUser();
    const calls = mockGoogle();
    expect(await withGoogleAccess(connection, async (token) => token)).toBe("access-1");
    expect(calls).toHaveLength(0);
  });

  it("rafraîchit un jeton expiré (ou presque) et enregistre le nouveau, chiffré", async () => {
    const { connection } = await connectedUser(30_000);
    const calls = mockGoogle({ token: () => tokenResponse({ access_token: "access-2" }) });

    expect(await withGoogleAccess(connection, async (token) => token)).toBe("access-2");
    expect(calls[0].body?.get("refresh_token")).toBe("refresh-1");

    const row = await readRow(connection.id);
    expect(decryptSecret(row.accessTokenEnc!)).toBe("access-2");
    expect(decryptSecret(row.refreshTokenEnc!)).toBe("refresh-1");
    expect(row.accessTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 3_500_000);
  });

  it("enregistre le nouveau refresh token si Google en émet un", async () => {
    const { connection } = await connectedUser(0);
    mockGoogle({ token: () => tokenResponse({ access_token: "access-2", refresh_token: "refresh-2" }) });
    await withGoogleAccess(connection, async (token) => token);
    expect(decryptSecret((await readRow(connection.id)).refreshTokenEnc!)).toBe("refresh-2");
  });

  it("jeton refusé (401) : rafraîchit une fois et relance l'appel", async () => {
    const { connection } = await connectedUser();
    mockGoogle({ token: () => tokenResponse({ access_token: "access-2" }) });
    const call = vi.fn(async (token: string) => {
      if (token === "access-1") throw new IntegrationError("unauthorized");
      return "ok";
    });
    expect(await withGoogleAccess(connection, call)).toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("refresh token révoqué ou expiré : la connexion passe en needs_reauth et les jetons sont effacés", async () => {
    const { connection } = await connectedUser(0);
    mockGoogle({ token: () => json({ error: "invalid_grant" }, 400) });

    expect(await rejectionCode(withGoogleAccess(connection, async (t) => t))).toBe("reauth_required");
    const row = await readRow(connection.id);
    expect(row).toMatchObject({ status: "needs_reauth", accessTokenEnc: null, refreshTokenEnc: null });

    // Les appels suivants échouent immédiatement, sans solliciter Google.
    const calls = mockGoogle();
    expect(await rejectionCode(withGoogleAccess((await getConnection(row.userId, "google"))!, async (t) => t))).toBe(
      "reauth_required",
    );
    expect(calls).toHaveLength(0);
  });

  it("jeton refusé même après rafraîchissement : demande une reconnexion", async () => {
    const { connection } = await connectedUser();
    mockGoogle();
    const call = async () => {
      throw new IntegrationError("unauthorized");
    };
    expect(await rejectionCode(withGoogleAccess(connection, call))).toBe("reauth_required");
    expect((await readRow(connection.id)).status).toBe("needs_reauth");
  });

  it("Google indisponible pendant le rafraîchissement : la connexion reste active", async () => {
    const { connection } = await connectedUser(0);
    mockGoogle({ token: () => json({}, 503) });
    expect(await rejectionCode(withGoogleAccess(connection, async (t) => t))).toBe("unavailable");
    expect((await readRow(connection.id)).status).toBe("active");
  });

  it("jeton indéchiffrable (clé de chiffrement changée) : demande une reconnexion", async () => {
    const { connection } = await connectedUser(0);
    connection.refreshTokenEnc = "v1:corrompu:corrompu:corrompu";
    const calls = mockGoogle();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await rejectionCode(withGoogleAccess(connection, async (t) => t))).toBe("reauth_required");
    expect(calls).toHaveLength(0);
    expect((await readRow(connection.id)).status).toBe("needs_reauth");
  });
});
