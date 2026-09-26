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
import { createProjectWithOwner } from "@/db/create-project";
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

/**
 * Projet créé comme dans l'application : `owner` en est le propriétaire et seul membre (un compte
 * est créé s'il n'est pas fourni). Ajouter d'autres membres avec `addMember`.
 */
export async function insertProject(db: Db, name = "Refonte du site", ownerId?: string) {
  const owner = ownerId ?? (await insertUser(db, "Propriétaire")).id;
  const { id } = await createProjectWithOwner(db, { name }, owner);
  const [project] = await db.select().from(schema.projects).where(sql`${schema.projects.id} = ${id}`);
  return project;
}

export async function addMember(db: Db, projectId: string, userId: string, role: schema.ProjectRole = "member") {
  await db.insert(schema.projectMembers).values({ projectId, userId, role });
}
