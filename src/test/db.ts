/**
 * Base Postgres en mémoire (PGlite) avec les vraies migrations du dossier ./drizzle.
 *
 * Dans un fichier de test :
 *   vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
 */
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

export async function createTestDb(): Promise<Db> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

/** Vide toutes les tables (les autres dépendent de users ou projects). */
export async function resetDb(db: Db) {
  await db.execute(sql`truncate table users, projects cascade`);
}

let counter = 0;

export async function insertUser(db: Db, name = "Camille Martin") {
  const [user] = await db
    .insert(schema.users)
    .values({ name, email: `user${++counter}@exemple.fr`, passwordHash: "x" })
    .returning();
  return user;
}

export async function insertProject(db: Db, name = "Refonte du site") {
  const [project] = await db.insert(schema.projects).values({ name }).returning();
  return project;
}
