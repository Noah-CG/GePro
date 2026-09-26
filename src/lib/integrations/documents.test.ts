import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { externalConnections, externalResources } from "@/db/schema";
import { getProjectResource, getProjectResources, getResourceLinks } from "@/lib/queries";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { DOC_ID, DOC_MARKDOWN, driveError, json, mockGoogle } from "@/test/google";
import { saveGoogleConnection } from "./connections";
import { readDocumentContent } from "./documents";
import { GOOGLE_SCOPE } from "./google";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

let resourceId: string;
let projectId: string;
let userId: string;

beforeEach(async () => {
  await resetDb(db);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const user = await insertUser(db, "Camille Martin");
  userId = user.id;
  projectId = (await insertProject(db, "Refonte du site", user.id)).id;
  await saveGoogleConnection(
    user.id,
    { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: new Date(Date.now() + 3_600_000), scope: GOOGLE_SCOPE },
    { id: "perm-1", email: "camille@gmail.com" },
  );
  const [connection] = await db.select().from(externalConnections);
  const [resource] = await db
    .insert(externalResources)
    .values({
      projectId,
      provider: "google",
      kind: "google_doc",
      externalId: DOC_ID,
      title: "Cahier des charges",
      url: `https://docs.google.com/document/d/${DOC_ID}/edit`,
      connectionId: connection.id,
      attachedBy: user.id,
      syncedAt: new Date(),
    })
    .returning();
  resourceId = resource.id;
});

describe("readDocumentContent", () => {
  it("renvoie le contenu du document exporté en Markdown, avec le compte de la personne qui l'a rattaché", async () => {
    const calls = mockGoogle();
    expect(await readDocumentContent(resourceId)).toEqual({ ok: true, markdown: DOC_MARKDOWN });
    expect(calls[0].headers.get("authorization")).toBe("Bearer access-1");
  });

  it("rafraîchit le jeton expiré avant l'export", async () => {
    await db.update(externalConnections).set({ accessTokenExpiresAt: new Date(0) });
    const calls = mockGoogle();
    expect((await readDocumentContent(resourceId)).ok).toBe(true);
    expect(calls.map((c) => c.url.pathname)).toEqual(["/token", `/drive/v3/files/${DOC_ID}/export`]);
  });

  it.each([
    ["document supprimé", () => driveError(404, "notFound"), "not_found"],
    ["document trop volumineux", () => driveError(403, "exportSizeLimitExceeded"), "too_large"],
    ["quota dépassé", () => json({}, 429, { "retry-after": "0.01" }), "quota"],
  ])("%s : renvoie le code d'erreur", async (_, response, code) => {
    mockGoogle({ export: response });
    expect(await readDocumentContent(resourceId)).toEqual({ ok: false, code });
  });

  it("connexion révoquée : reauth_required", async () => {
    await db.update(externalConnections).set({ accessTokenExpiresAt: new Date(0) });
    mockGoogle({ token: () => json({ error: "invalid_grant" }, 400) });
    expect(await readDocumentContent(resourceId)).toEqual({ ok: false, code: "reauth_required" });
  });

  it("compte déconnecté : disconnected, sans appel à Google", async () => {
    await db.delete(externalConnections);
    const calls = mockGoogle();
    expect(await readDocumentContent(resourceId)).toEqual({ ok: false, code: "disconnected" });
    expect(calls).toHaveLength(0);
  });

  it("document inconnu : not_found", async () => {
    expect(await readDocumentContent("00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, code: "not_found" });
  });
});

describe("état de synchronisation affiché", () => {
  it("document à jour : aucun problème, rien à rafraîchir", async () => {
    const { resources, stale } = await getProjectResources(projectId);
    expect(resources[0]).toMatchObject({ projectId, title: "Cahier des charges", problem: null, attachedByName: "Camille Martin" });
    expect(stale).toBe(false);
    expect(await getResourceLinks(userId)).toEqual([
      { id: resourceId, projectId, externalId: DOC_ID, title: "Cahier des charges", hasProblem: false },
    ]);
  });

  it("dernière synchronisation en erreur : problème signalé et nouvelle tentative prévue", async () => {
    await db.update(externalResources).set({ syncError: "forbidden" });
    const found = await getProjectResource(projectId, resourceId);
    expect(found).toMatchObject({ resource: { problem: "forbidden" }, stale: true });
    expect((await getResourceLinks(userId))[0].hasProblem).toBe(true);
  });

  it("compte déconnecté : problème « disconnected », aucune tentative prévue", async () => {
    await db.delete(externalConnections);
    const { resources, stale } = await getProjectResources(projectId);
    expect(resources[0].problem).toBe("disconnected");
    expect(stale).toBe(false);
  });

  it("n'expose pas une ressource d'un autre projet", async () => {
    const other = await insertProject(db, "Autre projet");
    expect(await getProjectResource(other.id, resourceId)).toBeNull();
  });
});
