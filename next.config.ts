import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
