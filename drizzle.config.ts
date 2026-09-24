import { defineConfig } from "drizzle-kit";

// Sert uniquement à générer les fichiers SQL de migration (npm run db:generate).
// L'application des migrations se fait via scripts/migrate.ts (Neon ou base locale).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
