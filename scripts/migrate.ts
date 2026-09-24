/** Applique les migrations SQL du dossier ./drizzle sur la base configurée. */
import "./env";
import { db, isLocalDb } from "../src/db";

async function main() {
  const migrationsFolder = "./drizzle";
  if (isLocalDb) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(db, { migrationsFolder });
  }
  console.log(`✔ Migrations appliquées (${isLocalDb ? "base locale .pglite" : "Neon"})`);
}

// Sortie explicite : PGlite garde la boucle d'événements active.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
