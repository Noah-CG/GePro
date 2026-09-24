/**
 * Client base de données.
 *
 * - DATABASE_URL défini  → Neon (driver HTTP serverless, idéal sur Vercel).
 * - DATABASE_URL absent  → PGlite, un Postgres embarqué stocké dans ./.pglite
 *   (pratique pour essayer l'app en local avant de créer la base Neon).
 *
 * Les deux exposent la même API Drizzle. Le driver HTTP de Neon ne gère pas les
 * transactions interactives : le code applicatif n'en utilise donc pas.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

export const isLocalDb = !process.env.DATABASE_URL;

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (url) return drizzle({ client: neon(url), schema });

  // Chargé à la demande pour ne jamais embarquer PGlite quand Neon est utilisé.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle: drizzlePglite } = require("drizzle-orm/pglite");
  const client = new PGlite(process.env.PGLITE_DIR ?? "./.pglite");
  return drizzlePglite({ client, schema }) as Db;
}

// Une seule instance par processus (évite d'en recréer à chaque rechargement en dev).
const globalForDb = globalThis as unknown as { __geproDb?: Db };
const getDb = () => (globalForDb.__geproDb ??= createDb());

/**
 * Connexion ouverte à la première requête seulement : importer ce module (par exemple
 * pendant `next build`) n'ouvre pas de connexion.
 */
export const db = new Proxy({} as Db, {
  get(_, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
