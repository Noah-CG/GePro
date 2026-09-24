import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { projectFileChunks, projectFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { CHUNK_SIZE, chunkSpan, parseRange, type ByteRange } from "@/lib/files";
import { isUuid } from "@/lib/validation";

type Props = { params: Promise<{ id: string }> };

/**
 * Contenu d'un fichier importé, pour le lecteur PDF de GePro et le bouton Télécharger.
 *
 * Gère les requêtes partielles (`Range`) : pdf.js ne télécharge que les morceaux utiles à la
 * page affichée. La réponse est lue en base morceau par morceau, au fil de l'envoi.
 * `?telechargement=1` propose l'enregistrement du fichier au lieu de son affichage.
 */
export async function GET(request: NextRequest, { params }: Props) {
  // Pas de redirection vers /login : ce sont pdf.js ou le navigateur qui appellent cette adresse.
  if (!(await getCurrentUser())) return new Response("Connexion requise.", { status: 401 });

  const { id } = await params;
  const file = isUuid(id)
    ? (
        await db
          .select({ name: projectFiles.name, mimeType: projectFiles.mimeType, size: projectFiles.size })
          .from(projectFiles)
          .where(and(eq(projectFiles.id, id), eq(projectFiles.status, "ready")))
      )[0]
    : undefined;
  if (!file) return new Response("Fichier introuvable.", { status: 404 });

  const range = parseRange(request.headers.get("range"), file.size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
  }
  const bytes = range ?? { start: 0, end: file.size - 1 };
  const download = request.nextUrl.searchParams.get("telechargement") === "1";

  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Content-Length": String(bytes.end - bytes.start + 1),
    "Content-Disposition": contentDisposition(download ? "attachment" : "inline", file.name),
    "Accept-Ranges": "bytes",
    // Le contenu d'un fichier ne change jamais : le navigateur peut le garder (pour cette personne seulement).
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);

  return new Response(streamBytes(id, bytes), { status: range ? 206 : 200, headers });
}

/** Octets `start` à `end` du fichier, lus en base un morceau à la fois. */
function streamBytes(fileId: string, { start, end }: ByteRange): ReadableStream<Uint8Array> {
  const { first, last } = chunkSpan({ start, end });
  let position = first;
  return new ReadableStream({
    async pull(controller) {
      const [chunk] = await db
        .select({ data: projectFileChunks.data })
        .from(projectFileChunks)
        .where(and(eq(projectFileChunks.fileId, fileId), eq(projectFileChunks.position, position)));
      // Fichier supprimé pendant la lecture.
      if (!chunk) return controller.error(new Error("Morceau de fichier introuvable."));

      const offset = position * CHUNK_SIZE;
      controller.enqueue(chunk.data.subarray(Math.max(start - offset, 0), end - offset + 1));
      if (++position > last) controller.close();
    },
  });
}

/** En-tête Content-Disposition avec un nom de fichier accentué (RFC 6266), et un repli ASCII. */
function contentDisposition(type: "inline" | "attachment", name: string): string {
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "document.pdf";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
