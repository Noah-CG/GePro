/**
 * Fichiers PDF importés dans GePro : règles communes au navigateur (retour immédiat avant
 * l'envoi) et au serveur (validation qui fait foi).
 *
 * Vercel limite chaque requête et chaque réponse à 4,5 Mo, et une Server Action accepte 1 Mo :
 * un fichier est donc envoyé, stocké et relu par morceaux de CHUNK_SIZE octets.
 */

export const PDF_MIME = "application/pdf";

/** Taille maximale d'un fichier importé. */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Taille d'un morceau : sous la limite de 1 Mo d'une Server Action, en-têtes du formulaire compris. */
export const CHUNK_SIZE = 960 * 1024;

/** Nombre de morceaux d'un fichier de `size` octets. */
export function chunkCount(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_SIZE));
}

/** Taille attendue du morceau `position` : CHUNK_SIZE, sauf pour le dernier. */
export function expectedChunkSize(size: number, position: number): number {
  return Math.min(CHUNK_SIZE, size - position * CHUNK_SIZE);
}

/**
 * Vrai si les octets commencent comme un PDF. La norme tolère quelques octets parasites avant
 * l'en-tête `%PDF-` : on le cherche dans le premier kilo-octet, comme les lecteurs PDF.
 */
export function isPdfSignature(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 5 <= head.length; i++) {
    // "%PDF-"
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) {
      return true;
    }
  }
  return false;
}

/** Message d'erreur si le fichier ne peut pas être importé, sinon null. */
export function pdfFileError(file: { name: string; size: number; type?: string }): string | null {
  const isPdf = file.type === PDF_MIME || /\.pdf$/i.test(file.name.trim());
  if (!isPdf) return "Seuls les fichiers PDF peuvent être importés.";
  if (file.size <= 0) return "Ce fichier est vide.";
  if (file.size > MAX_FILE_SIZE) return `Ce fichier dépasse la taille maximale de ${formatFileSize(MAX_FILE_SIZE)}.`;
  return null;
}

/** Nom affiché : le nom du fichier, nettoyé, sans répertoire (200 caractères au plus). */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // Caractères de contrôle et espaces multiples : sans intérêt dans un titre.
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return (clean || "Document.pdf").slice(0, 200);
}

/** Titre d'un fichier : son nom sans l'extension .pdf. */
export function fileTitle(name: string): string {
  return name.replace(/\.pdf$/i, "") || name;
}

/** « 340 Ko », « 1,2 Mo ». */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString("fr-FR", { maximumFractionDigits: mb < 10 ? 1 : 0 })} Mo`;
}

/** Plage d'octets inclusive, comme dans l'en-tête HTTP `Range`. */
export type ByteRange = { start: number; end: number };

/**
 * Lit un en-tête `Range` pour un fichier de `size` octets.
 * - null : pas d'en-tête, ou une forme non gérée (plusieurs plages…) → on renvoie tout le fichier ;
 * - "unsatisfiable" : plage hors du fichier → réponse 416.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from, to] = match;
  if (!from && !to) return null;

  if (!from) {
    // "bytes=-500" : les 500 derniers octets.
    const suffix = Number(to);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to ? Math.min(Number(to), size - 1) : size - 1;
  if (start >= size || (to && Number(to) < start)) return "unsatisfiable";
  return { start, end };
}

/** Morceaux (positions de début et de fin, incluses) qui contiennent la plage. */
export function chunkSpan({ start, end }: ByteRange): { first: number; last: number } {
  return { first: Math.floor(start / CHUNK_SIZE), last: Math.floor(end / CHUNK_SIZE) };
}
