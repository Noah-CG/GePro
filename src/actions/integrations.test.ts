import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { externalConnections, externalResources } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { saveGoogleConnection } from "@/lib/integrations/connections";
import { INTEGRATION_ERROR_MESSAGES as MSG } from "@/lib/integrations/errors";
import { GOOGLE_SCOPE } from "@/lib/integrations/google";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import { DOC_ID, driveError, driveFile, json, mockFetch, mockGoogle } from "@/test/google";
import {
  attachGoogleDoc,
  detachResource,
  disconnectGoogle,
  refreshProjectResources,
  searchGoogleDocs,
} from "./integrations";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit`;
const OTHER_DOC_ID = "1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210";

let me: Awaited<ReturnType<typeof insertUser>>;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  me = await insertUser(db, "Camille Martin");
  projectId = (await insertProject(db, "Refonte du site", me.id)).id;
  vi.mocked(requireUser).mockResolvedValue({ ...me, role: "member" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function connectGoogle(userId = me.id) {
  await saveGoogleConnection(
    userId,
    { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: new Date(Date.now() + 3_600_000), scope: GOOGLE_SCOPE },
    { id: `perm-${userId}`, email: "camille@gmail.com" },
  );
}

const resources = () => db.select().from(externalResources);

describe("attachGoogleDoc", () => {
  it("rattache un document à partir de son lien, avec titre, lien et date de modification", async () => {
    await connectGoogle();
    mockGoogle();

    expect(await attachGoogleDoc(projectId, DOC_URL)).toEqual({ ok: true, data: undefined });

    const [row] = await resources();
    expect(row).toMatchObject({
      projectId,
      provider: "google",
      kind: "google_doc",
      externalId: DOC_ID,
      title: "Cahier des charges",
      url: DOC_URL,
      externalUpdatedAt: new Date("2026-09-20T12:30:00.000Z"),
      attachedBy: me.id,
      syncError: null,
    });
    expect(row.syncedAt).not.toBeNull();
  });

  it("refuse de rattacher deux fois le même document", async () => {
    await connectGoogle();
    mockGoogle();
    await attachGoogleDoc(projectId, DOC_URL);
    expect(await attachGoogleDoc(projectId, DOC_ID)).toEqual({ ok: false, error: "Ce document est déjà rattaché au projet." });
    expect(await resources()).toHaveLength(1);
  });

  it("refuse un lien qui n'est pas celui d'un Google Doc, sans appeler Google", async () => {
    await connectGoogle();
    const calls = mockGoogle();
    expect(await attachGoogleDoc(projectId, "https://example.com/doc")).toEqual({ ok: false, error: MSG.invalid_link });
    expect(calls).toHaveLength(0);
  });

  it("demande de connecter un compte Google au préalable", async () => {
    expect(await attachGoogleDoc(projectId, DOC_URL)).toEqual({ ok: false, error: MSG.not_connected });
  });

  it("demande une reconnexion si la connexion a expiré", async () => {
    await connectGoogle();
    await db.update(externalConnections).set({ status: "needs_reauth" });
    expect(await attachGoogleDoc(projectId, DOC_URL)).toEqual({ ok: false, error: MSG.reauth_required });
  });

  it.each([
    ["fichier qui n'est pas un Google Doc", () => json(driveFile({ mimeType: "application/pdf" })), MSG.not_a_doc],
    ["document dans la corbeille", () => json(driveFile({ trashed: true })), MSG.trashed],
    ["document introuvable", () => driveError(404, "notFound"), MSG.not_found],
    ["droits insuffisants", () => driveError(403, "insufficientFilePermissions"), MSG.forbidden],
    ["quota dépassé", () => driveError(403, "userRateLimitExceeded"), MSG.quota],
  ])("affiche un message clair : %s", async (_, response, message) => {
    await connectGoogle();
    mockGoogle({ file: response });
    expect(await attachGoogleDoc(projectId, DOC_URL)).toEqual({ ok: false, error: message });
    expect(await resources()).toHaveLength(0);
  });

  it("affiche un message clair en cas de panne réseau", async () => {
    await connectGoogle();
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await attachGoogleDoc(projectId, DOC_URL)).toEqual({ ok: false, error: MSG.network });
  });

  it("valide les entrées", async () => {
    expect(await attachGoogleDoc("pas-un-uuid", DOC_URL)).toMatchObject({ ok: false });
    expect(await attachGoogleDoc(projectId, "   ")).toMatchObject({ ok: false });
  });
});

describe("searchGoogleDocs", () => {
  it("renvoie les documents avec une date lisible dans le fuseau de l'équipe", async () => {
    await connectGoogle();
    mockGoogle();
    expect(await searchGoogleDocs("cahier")).toEqual({
      ok: true,
      data: [{ id: DOC_ID, title: "Cahier des charges", updatedLabel: "20 sept. 2026 à 14:30", lastModifiedBy: "Léa Dubois" }],
    });
  });

  it("ne renvoie jamais de jeton au navigateur", async () => {
    await connectGoogle();
    mockGoogle();
    expect(JSON.stringify(await searchGoogleDocs(""))).not.toMatch(/access-1|refresh-1/);
  });
});

describe("detachResource", () => {
  it("détache un document", async () => {
    await connectGoogle();
    mockGoogle();
    await attachGoogleDoc(projectId, DOC_URL);
    const [row] = await resources();
    expect(await detachResource(row.id)).toEqual({ ok: true, data: undefined });
    expect(await resources()).toHaveLength(0);
  });
});

describe("refreshProjectResources", () => {
  beforeEach(async () => {
    await connectGoogle();
    mockGoogle({ file: (id) => json(driveFile({ id })) });
    await attachGoogleDoc(projectId, DOC_ID);
    await attachGoogleDoc(projectId, OTHER_DOC_ID);
  });

  const byId = async () => new Map((await resources()).map((r) => [r.externalId, r]));

  it("met à jour titre, lien et date de modification", async () => {
    mockGoogle({ file: (id) => json(driveFile({ id, name: `Nouveau titre ${id.slice(0, 4)}`, modifiedTime: "2026-09-23T08:00:00Z" })) });
    expect(await refreshProjectResources(projectId)).toEqual({ ok: true, data: undefined });
    const rows = await byId();
    expect(rows.get(DOC_ID)).toMatchObject({ title: "Nouveau titre 1AbC", externalUpdatedAt: new Date("2026-09-23T08:00:00Z") });
  });

  it("note un document supprimé sans effacer les dernières informations connues", async () => {
    mockGoogle({ file: (id) => (id === DOC_ID ? driveError(404, "notFound") : json(driveFile({ id }))) });
    expect(await refreshProjectResources(projectId)).toEqual({ ok: true, data: undefined });
    const rows = await byId();
    expect(rows.get(DOC_ID)).toMatchObject({ title: "Cahier des charges", syncError: "not_found" });
    expect(rows.get(OTHER_DOC_ID)?.syncError).toBeNull();
  });

  it("erreur passagère : renvoie un message et laisse le cache intact", async () => {
    mockGoogle({ file: () => driveError(403, "userRateLimitExceeded") });
    expect(await refreshProjectResources(projectId)).toEqual({ ok: false, error: MSG.quota });
    const rows = await byId();
    expect(rows.get(DOC_ID)).toMatchObject({ title: "Cahier des charges", syncError: null });
  });

  it("connexion révoquée : chaque document le signale et la connexion passe en needs_reauth", async () => {
    await db.update(externalConnections).set({ accessTokenExpiresAt: new Date(0) });
    mockGoogle({ token: () => json({ error: "invalid_grant" }, 400) });

    expect(await refreshProjectResources(projectId)).toEqual({ ok: true, data: undefined });
    const rows = await byId();
    expect(rows.get(DOC_ID)?.syncError).toBe("reauth_required");
    expect(rows.get(OTHER_DOC_ID)?.syncError).toBe("reauth_required");
    const [connection] = await db.select().from(externalConnections);
    expect(connection.status).toBe("needs_reauth");
  });

  it("rafraîchit le jeton une seule fois pour tout le lot après un 401", async () => {
    let tokenCalls = 0;
    mockGoogle({
      token: () => {
        tokenCalls++;
        return json({ access_token: "access-2", expires_in: 3599, scope: GOOGLE_SCOPE });
      },
      file: (id, call) =>
        call.headers.get("authorization") === "Bearer access-1" ? json({}, 401) : json(driveFile({ id, name: "À jour" })),
    });
    expect(await refreshProjectResources(projectId)).toEqual({ ok: true, data: undefined });
    expect(tokenCalls).toBe(1);
    expect([...(await byId()).values()].map((r) => r.title)).toEqual(["À jour", "À jour"]);
  });

  it("synchronise chaque document avec le compte de la personne qui l'a rattaché", async () => {
    const lea = await insertUser(db, "Léa Dubois");
    await addMember(db, projectId, lea.id);
    await connectGoogle(lea.id);
    vi.mocked(requireUser).mockResolvedValue({ ...lea, role: "member" });
    const [leaConnection] = await db.select().from(externalConnections).where(eq(externalConnections.userId, lea.id));
    expect(leaConnection).toBeDefined();

    // Léa consulte le projet : les documents de Camille restent synchronisés via le compte de Camille.
    const calls = mockGoogle();
    await refreshProjectResources(projectId);
    expect(calls.filter((c) => c.url.pathname.startsWith("/drive/v3/files/"))).toHaveLength(2);
    expect((await resources()).every((r) => r.attachedBy === me.id)).toBe(true);
  });
});

describe("disconnectGoogle", () => {
  it("révoque l'accès, supprime la connexion et garde les documents", async () => {
    await connectGoogle();
    mockGoogle();
    await attachGoogleDoc(projectId, DOC_URL);
    const calls = mockGoogle();

    expect(await disconnectGoogle()).toEqual({ ok: true, data: undefined });

    expect(calls.map((c) => c.url.pathname)).toEqual(["/revoke"]);
    expect(await db.select().from(externalConnections)).toHaveLength(0);
    const [row] = await resources();
    expect(row).toMatchObject({ title: "Cahier des charges", connectionId: null });
  });

  it("déconnecte même si Google est injoignable", async () => {
    await connectGoogle();
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await disconnectGoogle()).toEqual({ ok: true, data: undefined });
    expect(await db.select().from(externalConnections)).toHaveLength(0);
  });
});
