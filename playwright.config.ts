import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "3200";

/**
 * Tests end-to-end (`npm run test:e2e`). Le serveur est lancé sur une base PGlite jetable
 * (e2e/server.ts) : arrêter `npm run dev` avant, les deux partagent le dossier .next.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: "npx tsx e2e/server.ts",
    url: `http://localhost:${PORT}/connexion`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { E2E_PORT: PORT },
  },
});
