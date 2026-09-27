/**
 * Applique les migrations SQL du dossier ./drizzle sur la base configurée.
 *
 * `--vercel` (build Vercel, voir vercel.json) : seulement pour un déploiement de production.
 * Un déploiement de preview (branche pas encore fusionnée) ne migre pas la base : s'il partage
 * celle de la production, il la modifierait avant la fusion. Avec une base propre aux previews
 * (branche Neon), définissez MIGRATE_PREVIEW=1 dans l'environnement Preview de Vercel.
 */
import "./env";
import { db, isLocalDb } from "../src/db";

async function main() {
  if (process.argv.includes("--vercel") && process.env.VERCEL_ENV !== "production" && process.env.MIGRATE_PREVIEW !== "1") {
    console.log(`Migrations ignorées : déploiement ${process.env.VERCEL_ENV ?? "hors Vercel"} (MIGRATE_PREVIEW=1 pour les appliquer).`);
    return;
  }
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
