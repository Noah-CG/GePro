import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (base locale de démo) embarque du WebAssembly : on le laisse hors du bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
