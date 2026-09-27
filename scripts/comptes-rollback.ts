/**
 * Retour arrière de la migration 0013_comptes_utilisateurs (voir scripts/rollback/0013_comptes_utilisateurs.sql).
 *
 *   npm run db:comptes-rollback -- --confirm
 *
 * À lancer seulement après avoir redéployé le code d'avant les comptes (Vercel ET serveur Linux),
 * et après une sauvegarde. Aucun compte n'est supprimé.
 */
import "./env";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, isLocalDb } from "../src/db";

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("Retour arrière des comptes utilisateurs : relancez avec --confirm (après une sauvegarde et le redéploiement de l'ancien code).");
    process.exit(1);
  }
  const script = readFileSync("scripts/rollback/0013_comptes_utilisateurs.sql", "utf8");
  // Un seul bloc DO : exécuté d'un seul tenant, y compris sur Neon.
  await db.execute(sql.raw(script));
  console.log(`✔ Comptes utilisateurs retirés du schéma (${isLocalDb ? "base locale .pglite" : "Neon"}) ; aucun compte supprimé.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
