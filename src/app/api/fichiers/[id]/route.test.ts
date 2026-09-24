import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectFileChunks, projectFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { CHUNK_SIZE, chunkCount } from "@/lib/files";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { GET } from "./route";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
// Fichiers de plusieurs Mo en base : plus lent que les autres tests quand tout tourne en parallèle.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

/** Contenu de test : 2 morceaux complets et un dernier de 10 octets. */
const content = new Uint8Array(2 * CHUNK_SIZE + 10).map((_, i) => i % 251);
let fileId: string;

/** Enregistre un fichier directement en base, découpé comme le fait l'import. */
async function insertFile(bytes: Uint8Array, status: "ready" | "uploading" = "ready", name = "Compte rendu été.pdf") {
  const project = await insertProject(db);
  const [file] = await db
    .insert(projectFiles)
    .values({ projectId: project.id, name, size: bytes.length, chunkCount: chunkCount(bytes.length), status })
    .returning();
  for (let position = 0; position < file.chunkCount; position++) {
    const data = bytes.slice(position * CHUNK_SIZE, (position + 1) * CHUNK_SIZE);
    await db.insert(projectFileChunks).values({ fileId: file.id, position, data });
  }
  return file.id;
}

function get(id: string, { range, query = "" }: { range?: string; query?: string } = {}) {
  const request = new NextRequest(`http://localhost/api/fichiers/${id}${query}`, { headers: range ? { range } : {} });
  return GET(request, { params: Promise.resolve({ id }) });
}

/** Vrai si la réponse contient exactement ces octets (toEqual serait très lent sur 2 Mo). */
const sameBytes = async (res: Response, expected: Uint8Array) => Buffer.from(await res.arrayBuffer()).equals(expected);

beforeEach(async () => {
  await resetDb(db);
  const user = await insertUser(db);
  vi.mocked(getCurrentUser).mockResolvedValue({ ...user, role: "member" });
  fileId = await insertFile(content);
});

describe("GET /api/fichiers/[id]", () => {
  it("renvoie tout le fichier, reconstitué à partir de ses morceaux", async () => {
    const res = await get(fileId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(content.length));
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="Compte rendu ete.pdf"; filename*=UTF-8''Compte%20rendu%20%C3%A9t%C3%A9.pdf`);
    expect(await sameBytes(res, content)).toBe(true);
  });

  it("renvoie une plage d'octets à cheval sur deux morceaux", async () => {
    const start = CHUNK_SIZE - 5;
    const res = await get(fileId, { range: `bytes=${start}-${start + 9}` });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes ${start}-${start + 9}/${content.length}`);
    expect(res.headers.get("content-length")).toBe("10");
    expect(await sameBytes(res, content.slice(start, start + 10))).toBe(true);
  });

  it("renvoie la fin du fichier", async () => {
    const res = await get(fileId, { range: "bytes=-20" });
    expect(res.status).toBe(206);
    expect(await sameBytes(res, content.slice(-20))).toBe(true);
  });

  it("refuse une plage hors du fichier", async () => {
    const res = await get(fileId, { range: `bytes=${content.length}-` });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${content.length}`);
  });

  it("propose l'enregistrement du fichier avec ?telechargement=1", async () => {
    const res = await get(fileId, { query: "?telechargement=1" });
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; /);
  });

  it("exige d'être connecté", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await get(fileId)).status).toBe(401);
  });

  it("ne sert ni un fichier inconnu ni un import inachevé", async () => {
    const pending = await insertFile(content.slice(0, 100), "uploading");
    expect((await get(pending)).status).toBe(404);
    expect((await get(crypto.randomUUID())).status).toBe(404);
    expect((await get("pas-un-uuid")).status).toBe(404);
  });
});
