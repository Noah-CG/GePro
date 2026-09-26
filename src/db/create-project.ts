/**
 * Création d'un projet et de son propriétaire, d'un seul tenant.
 *
 * Le driver HTTP de Neon n'a pas de transaction interactive : le projet et la ligne
 * project_members du propriétaire sont donc créés par une seule instruction SQL (CTE), atomique
 * par nature. Rien d'autre n'est créé : un nouveau projet est vierge.
 */
import { sql } from "drizzle-orm";
import type { Db } from "./index";
import { projectMembers, projects } from "./schema";

export type NewProject = {
  name: string;
  description?: string;
  color?: string;
  startDate?: string | null;
  endDate?: string | null;
  archivedAt?: Date | null;
};

export async function createProjectWithOwner(db: Db, project: NewProject, ownerId: string): Promise<{ id: string }> {
  const { rows } = await db.execute<{ id: string }>(sql`
    with created as (
      insert into ${projects} (name, description, color, start_date, end_date, archived_at, created_by, owner_id)
      values (
        ${project.name},
        ${project.description ?? ""},
        ${project.color ?? "#6366f1"},
        ${project.startDate ?? null}::date,
        ${project.endDate ?? null}::date,
        ${project.archivedAt ?? null}::timestamptz,
        ${ownerId}::uuid,
        ${ownerId}::uuid
      )
      returning id
    )
    insert into ${projectMembers} (project_id, user_id, role)
    select id, ${ownerId}::uuid, 'owner' from created
    returning project_id as id
  `);
  return { id: rows[0].id };
}
