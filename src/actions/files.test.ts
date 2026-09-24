import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectFileChunks, projectFiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CHUNK_SIZE, MAX_FILE_SIZE } from "@/lib/files";
import { getFileLinks, getProjectFile, getProjectFiles } from "@/lib/queries";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { cancelFileUpload, deleteFile, finishFileUpload, startFileUpload, uploadFileChunk } from "./files";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type User = Awaited<ReturnType<typeof insertUser>>;
let camille: User;
let lea: User;
let admin: User;
let projectId: string;

const actAs = (user: User, role: "admin" | "member" = "member") => vi.mocked(requireUser).mockResolvedValue({ ...user, role });

/** Faux PDF de `size` octets : l'en-tête suffit, le serveur ne lit pas le reste. */
function pdfBytes(size: number) {
  const bytes = new Uint8Array(size).map((_, i) => i % 251);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  return bytes;
}

function chunkForm(id: string, position: number, data: Uint8Array) {
  const form = new FormData();
  form.set("id", id);
  form.set("position", String(position));
  form.set("chunk", new Blob([data as Uint8Array<ArrayBuffer>]));
  return form;
}

async function start(bytes: Uint8Array, name = "Cahier des charges.pdf") {
  const res = await startFileUpload(projectId, { name, size: bytes.length, type: "application/pdf" });
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

async function sendChunks(id: string, bytes: Uint8Array) {
  for (let position = 0; position * CHUNK_SIZE < bytes.length; position++) {
    const res = await uploadFileChunk(chunkForm(id, position, bytes.subarray(position * CHUNK_SIZE, (position + 1) * CHUNK_SIZE)));
    if (!res.ok) throw new Error(res.error);
  }
}

/** Import complet par Camille. */
async function camilleFile(bytes = pdfBytes(1000)) {
  actAs(camille);
  const { id } = await start(bytes);
  await sendChunks(id, bytes);
  const res = await finishFileUpload(id);
  if (!res.ok) throw new Error(res.error);
  return id;
}

const findFile = async (id: string) => (await db.select().from(projectFiles).where(eq(projectFiles.id, id)))[0];

beforeEach(async () => {
  await resetDb(db);
  camille = await insertUser(db, "Camille Martin");
  lea = await insertUser(db, "Léa Dubois");
  admin = await insertUser(db, "Hugo Moreau");
  projectId = (await insertProject(db)).id;
});

describe("import d'un PDF", () => {
  it("stocke le fichier en morceaux et le rend visible une fois terminé", async () => {
    const bytes = pdfBytes(2 * CHUNK_SIZE + 10);
    actAs(camille);
    const { id, chunkCount } = await start(bytes);
    expect(chunkCount).toBe(3);

    await sendChunks(id, bytes);
    // Tant que l'import n'est pas terminé, le fichier n'apparaît nulle part.
    expect(await getProjectFiles(projectId)).toEqual([]);

    expect(await finishFileUpload(id)).toEqual({ ok: true, data: { id, projectId } });
    expect(await findFile(id)).toMatchObject({ status: "ready", size: bytes.length, uploadedBy: camille.id, name: "Cahier des charges.pdf" });

    const chunks = await db.select().from(projectFileChunks).where(eq(projectFileChunks.fileId, id)).orderBy(projectFileChunks.position);
    expect(Buffer.concat(chunks.map((c) => c.data)).equals(Buffer.from(bytes))).toBe(true);

    expect(await getProjectFiles(projectId)).toEqual([
      expect.objectContaining({ id, title: "Cahier des charges", sizeLabel: "1,9 Mo", uploadedBy: camille.id, uploadedByName: "Camille Martin" }),
    ]);
    expect(await getProjectFile(projectId, id)).toMatchObject({ id, name: "Cahier des charges.pdf" });
    expect(await getFileLinks()).toEqual([{ id, projectId, title: "Cahier des charges" }]);
  });

  it("accepte un morceau renvoyé après une coupure", async () => {
    const bytes = pdfBytes(100);
    actAs(camille);
    const { id } = await start(bytes);
    await sendChunks(id, bytes);
    await sendChunks(id, bytes);
    expect((await finishFileUpload(id)).ok).toBe(true);
  });

  it.each([
    ["un autre format", { name: "notes.docx", size: 1000, type: "application/msword" }, "Seuls les fichiers PDF peuvent être importés."],
    ["un fichier vide", { name: "vide.pdf", size: 0, type: "application/pdf" }, "Ce fichier est vide."],
    ["un fichier trop gros", { name: "plans.pdf", size: MAX_FILE_SIZE + 1, type: "application/pdf" }, "Ce fichier dépasse la taille maximale de 20 Mo."],
  ])("refuse %s", async (_, file, error) => {
    actAs(camille);
    expect(await startFileUpload(projectId, file)).toEqual({ ok: false, error });
  });

  it("refuse un projet inconnu", async () => {
    actAs(camille);
    const file = { name: "a.pdf", size: 100, type: "application/pdf" };
    expect(await startFileUpload("pas-un-uuid", file)).toEqual({ ok: false, error: "Projet introuvable." });
    expect(await startFileUpload(crypto.randomUUID(), file)).toEqual({ ok: false, error: "Projet introuvable." });
  });

  it("refuse un fichier qui n'est pas un PDF, et oublie l'import", async () => {
    actAs(camille);
    const { id } = await start(pdfBytes(100));
    const fake = new TextEncoder().encode("PK\u0003\u0004".padEnd(100, "x"));
    expect(await uploadFileChunk(chunkForm(id, 0, fake))).toEqual({ ok: false, error: "Ce fichier n'est pas un PDF valide." });
    expect(await findFile(id)).toBeUndefined();
  });

  it("refuse un morceau de mauvaise taille ou hors du fichier", async () => {
    const bytes = pdfBytes(100);
    actAs(camille);
    const { id } = await start(bytes);
    const invalid = { ok: false, error: "Morceau de fichier invalide : relancez l'import." };
    expect(await uploadFileChunk(chunkForm(id, 0, bytes.subarray(0, 99)))).toEqual(invalid);
    expect(await uploadFileChunk(chunkForm(id, 1, bytes))).toEqual(invalid);
  });

  it("n'accepte les morceaux que de la personne qui a lancé l'import", async () => {
    const bytes = pdfBytes(100);
    actAs(camille);
    const { id } = await start(bytes);
    actAs(lea);
    const notFound = { ok: false, error: "Import introuvable ou déjà terminé : relancez l'import." };
    expect(await uploadFileChunk(chunkForm(id, 0, bytes))).toEqual(notFound);
    expect(await finishFileUpload(id)).toEqual(notFound);
  });

  it("refuse de terminer un import incomplet", async () => {
    const bytes = pdfBytes(CHUNK_SIZE + 10);
    actAs(camille);
    const { id } = await start(bytes);
    await uploadFileChunk(chunkForm(id, 0, bytes.subarray(0, CHUNK_SIZE)));
    expect(await finishFileUpload(id)).toEqual({ ok: false, error: "L'import est incomplet : relancez-le." });
    expect(await getProjectFiles(projectId)).toEqual([]);
  });

  it("annule un import en cours", async () => {
    actAs(camille);
    const { id } = await start(pdfBytes(100));
    expect(await cancelFileUpload(id)).toEqual({ ok: true, data: undefined });
    expect(await findFile(id)).toBeUndefined();
  });

  it("supprime les imports abandonnés depuis plus d'un jour", async () => {
    actAs(camille);
    const { id: old } = await start(pdfBytes(100));
    await db.update(projectFiles).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(projectFiles.id, old));
    const { id: recent } = await start(pdfBytes(100));
    expect(await findFile(old)).toBeUndefined();
    expect(await findFile(recent)).toBeDefined();
  });
});

describe("deleteFile", () => {
  it("laisse la personne qui a importé le fichier le supprimer, morceaux compris", async () => {
    const id = await camilleFile();
    expect(await deleteFile(id)).toEqual({ ok: true, data: undefined });
    expect(await findFile(id)).toBeUndefined();
    expect(await db.select().from(projectFileChunks)).toEqual([]);
  });

  it("refuse la suppression à un autre membre", async () => {
    const id = await camilleFile();
    actAs(lea);
    expect(await deleteFile(id)).toEqual({
      ok: false,
      error: "Seule la personne qui a importé ce fichier ou un administrateur peut le supprimer.",
    });
    expect(await findFile(id)).toBeDefined();
  });

  it("laisse un administrateur supprimer le fichier", async () => {
    const id = await camilleFile();
    actAs(admin, "admin");
    expect((await deleteFile(id)).ok).toBe(true);
    expect(await findFile(id)).toBeUndefined();
  });

  it("signale un fichier inconnu", async () => {
    actAs(camille);
    expect(await deleteFile(crypto.randomUUID())).toEqual({ ok: false, error: "Fichier introuvable." });
    expect(await deleteFile("pas-un-uuid")).toEqual({ ok: false, error: "Fichier introuvable." });
  });
});
