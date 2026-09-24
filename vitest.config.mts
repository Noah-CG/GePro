import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // Garde-fou de Next.js contre l'import de code serveur dans le navigateur : sans objet ici.
      "server-only": path("./src/test/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // Chaque test repart de mocks et de globales (fetch) propres.
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
