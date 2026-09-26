"use server";

import { and, eq, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectFileChunks, projectFiles } from "@/db/schema";
import { atLeast, authorizeProject, authorizeProjectOf } from "@/lib/access";
import { requireUser, type SessionUser } from "@/lib/auth";
import { chunkCount, cleanFileName, expectedChunkSize, isPdfSignature, pdfFileError, PDF_MIME } from "@/lib/files";
import { isUuid } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

/**
 * Import d'un PDF en trois temps, pour rester sous la limite de taille d'une requête :
 * startFileUpload (fiche du fichier), uploadFileChunk pour chaque morceau, puis finishFileUpload
 * qui vérifie que tout est arrivé et rend le fichier visible.
 */

/** Rafraîchit la barre latérale et la page Documents. */
const refresh = () => revalidatePath("/", "layout");

/** Au-delà, un import resté inachevé (onglet fermé, coupure réseau…) est supprimé. */
const ABANDONED_UPLOAD_MS = 24 * 3_600_000;

const UPLOAD_NOT_FOUND = "Import introuvable ou déjà terminé : relancez l'import.";

/** Fichier en cours d'import par `me`, ou null. */
async function pendingUpload(id: unknown, me: SessionUser) {
  if (typeof id !== "string" || !isUuid(id)) return null;
  const [file] = await db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, id), eq(projectFiles.status, "uploading"), eq(projectFiles.uploadedBy, me.id)));
  return file ?? null;
}

export async function startFileUpload(
  projectId: string,
  file: { name: string; size: number; type: string },
): Promise<ActionResult<{ id: string; chunkCount: number }>> {
  const auth = await authorizeProject(projectId);
  if (!auth.ok) return fail(auth.error);
  const me = auth.access.user;
  const name = cleanFileName(String(file?.name ?? ""));
  const size = Number(file?.size);
  if (!Number.isSafeInteger(size)) return fail("Fichier invalide.");
  const error = pdfFileError({ name, size, type: String(file?.type ?? "") });
  if (error) return fail(error);

  // Ménage : les imports abandonnés depuis plus d'un jour n'aboutiront plus.
  await db
    .delete(projectFiles)
    .where(and(eq(projectFiles.status, "uploading"), lt(projectFiles.createdAt, new Date(Date.now() - ABANDONED_UPLOAD_MS))));

  const count = chunkCount(size);
  const [row] = await db
    .insert(projectFiles)
    .values({ projectId, name, mimeType: PDF_MIME, size, chunkCount: count, uploadedBy: me.id })
    .returning({ id: projectFiles.id });
  return ok({ id: row.id, chunkCount: count });
}

/** Reçoit un morceau : `id` (fichier), `position` (à partir de 0) et `chunk` (les octets). */
export async function uploadFileChunk(form: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const file = await pendingUpload(form.get("id"), me);
  if (!file) return fail(UPLOAD_NOT_FOUND);

  const position = Number(form.get("position"));
  const chunk = form.get("chunk");
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= file.chunkCount ||
    !(chunk instanceof Blob) ||
    chunk.size !== expectedChunkSize(file.size, position)
  ) {
    return fail("Morceau de fichier invalide : relancez l'import.");
  }

  const data = new Uint8Array(await chunk.arrayBuffer());
  if (position === 0 && !isPdfSignature(data)) {
    await db.delete(projectFiles).where(eq(projectFiles.id, file.id));
    return fail("Ce fichier n'est pas un PDF valide.");
  }

  // Un morceau renvoyé (nouvel essai après une coupure) remplace le précédent.
  await db
    .insert(projectFileChunks)
    .values({ fileId: file.id, position, data })
    .onConflictDoUpdate({ target: [projectFileChunks.fileId, projectFileChunks.position], set: { data } });
  return ok(undefined);
}

/** Termine l'import : le fichier apparaît dans le projet si tous ses morceaux sont arrivés. */
export async function finishFileUpload(id: string): Promise<ActionResult<{ id: string; projectId: string }>> {
  const me = await requireUser();
  const file = await pendingUpload(id, me);
  if (!file) return fail(UPLOAD_NOT_FOUND);

  const [received] = await db
    .select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(octet_length(${projectFileChunks.data})), 0)::int` })
    .from(projectFileChunks)
    .where(eq(projectFileChunks.fileId, file.id));
  if (received.count !== file.chunkCount || received.bytes !== file.size) {
    return fail("L'import est incomplet : relancez-le.");
  }
  // Retiré du projet pendant l'import : le fichier n'y apparaît pas.
  const auth = await authorizeProject(file.projectId);
  if (!auth.ok) {
    await db.delete(projectFiles).where(eq(projectFiles.id, file.id));
    return fail(auth.error);
  }

  await db.update(projectFiles).set({ status: "ready" }).where(eq(projectFiles.id, file.id));
  refresh();
  return ok({ id: file.id, projectId: file.projectId });
}

/** Abandonne un import en cours (erreur, annulation) : ses morceaux déjà reçus sont supprimés. */
export async function cancelFileUpload(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const file = await pendingUpload(id, me);
  if (file) await db.delete(projectFiles).where(eq(projectFiles.id, file.id));
  return ok(undefined);
}

/** Supprime un fichier importé : seule la personne qui l'a importé, ou un owner / admin du projet, le peut. */
export async function deleteFile(id: string): Promise<ActionResult> {
  const auth = await authorizeProjectOf("file", id);
  if (!auth.ok) return fail(auth.error);
  const { user: me, role } = auth.access;
  const [file] = await db
    .select({ uploadedBy: projectFiles.uploadedBy })
    .from(projectFiles)
    .where(and(eq(projectFiles.id, id), eq(projectFiles.status, "ready")));
  if (!file) return fail("Fichier introuvable.");
  if (!atLeast(role, "admin") && file.uploadedBy !== me.id) {
    return fail("Seule la personne qui a importé ce fichier ou un administrateur du projet peut le supprimer.");
  }

  await db.delete(projectFiles).where(eq(projectFiles.id, id));
  refresh();
  return ok(undefined);
}
