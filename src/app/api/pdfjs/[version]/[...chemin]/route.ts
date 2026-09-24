import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

type Props = { params: Promise<{ version: string; chemin: string[] }> };

/** Dossiers de pdfjs-dist utiles au lecteur, et les extensions servies pour chacun. */
const ASSETS: Record<string, RegExp> = {
  // Tables de caractères (textes en chinois, japonais, coréen…).
  cmaps: /^[\w-]+\.bcmap$/,
  // Polices standard non incorporées au PDF.
  standard_fonts: /^[\w-]+\.(?:pfb|ttf)$/,
  // Décodeurs d'images JBIG2 et JPEG 2000 (PDF scannés) et gestion des couleurs.
  wasm: /^(?:openjpeg|jbig2|qcms_bg)(?:\.wasm|_nowasm_fallback\.js)$/,
  iccs: /^[\w-]+\.icc$/,
};

const CONTENT_TYPES: Record<string, string> = { ".wasm": "application/wasm", ".js": "text/javascript" };

/**
 * Fichiers annexes de pdf.js, lus dans node_modules/pdfjs-dist : ils suivent ainsi la version
 * installée sans être recopiés dans /public. La version dans l'adresse permet de les garder
 * en cache indéfiniment (voir outputFileTracingIncludes dans next.config.ts pour Vercel).
 */
export async function GET(_request: NextRequest, { params }: Props) {
  const { chemin } = await params;
  const [dir, name, ...rest] = chemin;
  if (rest.length > 0 || !name || !Object.hasOwn(ASSETS, dir) || !ASSETS[dir].test(name)) {
    return new Response("Fichier introuvable.", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readFile(path.join(process.cwd(), "node_modules", "pdfjs-dist", dir, name));
  } catch {
    return new Response("Fichier introuvable.", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(name)] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
