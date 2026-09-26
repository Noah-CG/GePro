/**
 * Retour arrière de la migration 0012_isolation_projets (voir scripts/rollback/0012_isolation_projets.sql).
 *
 *   npm run db:isolation-rollback -- --confirm
 *
 * À lancer seulement après avoir redéployé le code d'avant l'isolation, et après une sauvegarde.
 */
import "./env";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, isLocalDb } from "../src/db";

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Retour arrière de l'isolation des projets : relancez avec --confirm (après une sauvegarde).");
    process.exit(1);
  }
  const script = readFileSync("scripts/rollback/0012_isolation_projets.sql", "utf8");
  // Un seul bloc DO : exécuté d'un seul tenant, y compris sur Neon.
  await db.execute(sql.raw(script));
  console.log(`✔ Isolation des projets retirée (${isLocalDb ? "base locale .pglite" : "Neon"})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
