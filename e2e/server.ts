/**
 * Serveur des tests end-to-end : base PGlite jetable (./.pglite-e2e, recréée à chaque lancement),
 * migrations, données de test (e2e/seed.ts), puis `next dev`.
 *
 * DATABASE_URL vaut " " (un espace) : défini, donc ni dotenv ni Next ne le remplacent par celui de
 * .env.local, mais vide une fois nettoyé, donc src/db choisit PGlite. Les tests ne touchent
 * jamais la base Neon.
 */
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const PORT = process.env.E2E_PORT ?? "3200";
const env = { ...process.env, DATABASE_URL: " ", PGLITE_DIR: ".pglite-e2e" };

rmSync(".pglite-e2e", { recursive: true, force: true });
for (const script of ["scripts/migrate.ts", "e2e/seed.ts"]) {
  const run = spawnSync("npx", ["tsx", script], { env, stdio: "inherit", shell: true });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

const next = spawn("npx", ["next", "dev", "-p", PORT], { env, stdio: "inherit", shell: true });
next.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => next.kill(signal));
