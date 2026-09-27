import type { NextConfig } from "next";

/**
 * En-têtes de sécurité de toutes les réponses : GePro ne s'affiche jamais dans le cadre d'un autre
 * site (clickjacking), et le navigateur ne devine pas les types de fichiers.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Serveur autonome dans .next/standalone : l'image Docker n'embarque que les fichiers utiles.
  output: "standalone",
  // PGlite (base locale de démo) embarque du WebAssembly : on le laisse hors du bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Fichiers annexes du lecteur PDF, lus à l'exécution par la route /api/pdfjs (Vercel ne
  // déploie que les fichiers dont le code a besoin).
  outputFileTracingIncludes: {
    "/api/pdfjs/**": ["./node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm,iccs}/*"],
  },
  // …et seulement eux : le chemin étant calculé, le traçage embarquerait tout le paquet (34 Mo).
  outputFileTracingExcludes: {
    "/api/pdfjs/**": ["./node_modules/pdfjs-dist/{build,legacy,web,types,image_decoders}/**", "./node_modules/@napi-rs/**"],
  },
};

export default nextConfig;
