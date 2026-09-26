/**
 * Aperçu de la migration 0011_isolation_projets, en LECTURE SEULE : propriétaire et membres prévus
 * pour chaque projet, événements d'équipe à rattacher. Mêmes règles que drizzle/0011_isolation_projets.sql.
 *
 *   npm run db:isolation-preview
 *
 * Sur la base configurée (Neon si DATABASE_URL, sinon ./.pglite). N'écrit rien.
 */
import "./env";
import { sql } from "drizzle-orm";
import { db, isLocalDb } from "../src/db";

type Row = Record<string, unknown>;
const rows = async <T extends Row>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;

async function main() {
  console.log(`Base : ${isLocalDb ? "locale (.pglite)" : "Neon (DATABASE_URL)"}\n`);

  const [applied] = await rows<{ applied: boolean }>(sql`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'owner_id'
    ) as applied
  `);
  if (applied.applied) {
    console.log("La migration est déjà appliquée : membres actuels.\n");
    const members = await rows<{ project: string; name: string; email: string; role: string }>(sql`
      select p.name as project, u.name, u.email, m.role::text as role
      from project_members m join projects p on p.id = m.project_id join users u on u.id = m.user_id
      order by p.name, m.role, u.name
    `);
    console.table(members);
    return;
  }

  const owners = await rows<{ id: string; project: string; owner: string | null; source: string }>(sql`
    with fallback as (
      select coalesce(
        (select id from users where role = 'admin' order by created_at, id limit 1),
        (select id from users order by created_at, id limit 1)
      ) as id
    )
    select p.id, p.name as project,
           coalesce(c.name || ' <' || c.email || '>', f.name || ' <' || f.email || '>') as owner,
           case when p.created_by is not null then 'créateur' else 'repli : plus ancien admin' end as source
    from projects p
    left join users c on c.id = p.created_by
    left join users f on f.id = (select id from fallback)
    order by p.created_at, p.id
  `);
  console.log(`Projets : ${owners.length}`);
  console.table(owners.map(({ project, owner, source }) => ({ projet: project, propriétaire: owner ?? "AUCUN (échec)", source })));

  // Mêmes règles que la migration : propriétaire, puis contributeurs.
  const planned = sql`
    owners as (
      select id as project_id, coalesce(
        created_by,
        (select id from users where role = 'admin' order by created_at, id limit 1),
        (select id from users order by created_at, id limit 1)
      ) as user_id from projects
    ), contributors as (
      select t.project_id, a.user_id from task_assignees a join tasks t on t.id = a.task_id
      union select project_id, created_by from tasks
      union select project_id, created_by from project_events
      union select project_id, created_by from important_days
      union select project_id, uploaded_by from project_files
      union select project_id, attached_by from external_resources
      union select project_id, user_id from work_sessions
      union select project_id, linked_by from project_discord
      union select project_id, user_id from google_calendar_sync_projects
    ), planned as (
      select project_id, user_id from owners
      union select project_id, user_id from contributors where project_id is not null and user_id is not null
    )`;

  const members = await rows<{ project: string; name: string; email: string }>(sql`
    with ${planned}
    select distinct p.name as project, u.name, u.email
    from contributors c
    join projects p on p.id = c.project_id
    join users u on u.id = c.user_id
    where not exists (select 1 from owners o where o.project_id = c.project_id and o.user_id = c.user_id)
    order by 1, 2
  `);
  console.log(`\nMembres ajoutés avec le rôle "member" (contributeurs) : ${members.length}`);
  console.table(members.map(({ project, name, email }) => ({ projet: project, membre: `${name} <${email}>` })));

  const [counts] = await rows<{ users: number; team_events: number; projects: number; no_project_sessions: number }>(sql`
    select (select count(*)::int from users) as users,
           (select count(*)::int from project_events where project_id is null) as team_events,
           (select count(*)::int from projects) as projects,
           (select count(*)::int from work_sessions where project_id is null) as no_project_sessions
  `);
  const [first] = await rows<{ name: string }>(sql`select name from projects order by created_at, id limit 1`);
  const withoutAccess = await rows<{ name: string; email: string }>(sql`
    with ${planned}
    select u.name, u.email from users u
    where not exists (select 1 from planned m where m.user_id = u.id)
    order by u.name
  `);

  console.log(`\nÉvénements d'équipe (sans projet) : ${counts.team_events}`);
  if (counts.team_events > 0) {
    console.log(`  → originaux rattachés au plus ancien projet : « ${first?.name ?? "AUCUN PROJET (échec)"} »`);
    console.log(`  → copies créées dans les ${Math.max(counts.projects - 1, 0)} autres projets : ${counts.team_events * Math.max(counts.projects - 1, 0)}`);
  }
  console.log(`\nPériodes de temps de travail sans projet (inchangées) : ${counts.no_project_sessions}`);
  console.log(`\nComptes qui ne seront membres d'aucun projet (à inviter ensuite) : ${withoutAccess.length} / ${counts.users}`);
  if (withoutAccess.length) console.table(withoutAccess.map(({ name, email }) => ({ compte: `${name} <${email}>` })));
  console.log("\nRien n'a été modifié.");
}

// Sortie explicite : PGlite garde la boucle d'événements active.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
