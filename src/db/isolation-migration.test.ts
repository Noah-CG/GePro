/**
 * Migration 0012_isolation_projets sur des données d'avant l'isolation : propriétaires, membres,
 * événements d'équipe ; rejouable, réversible, sans perte de données.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATION = readFileSync("drizzle/0012_isolation_projets.sql", "utf8");
const ROLLBACK = readFileSync("scripts/rollback/0012_isolation_projets.sql", "utf8");

let client: PGlite;
let folder: string;

const ids = {
  camille: "00000000-0000-4000-8000-000000000001",
  hugo: "00000000-0000-4000-8000-000000000002",
  lea: "00000000-0000-4000-8000-000000000003",
  nadia: "00000000-0000-4000-8000-000000000004",
  site: "10000000-0000-4000-8000-000000000001",
  appli: "10000000-0000-4000-8000-000000000002",
  orphan: "10000000-0000-4000-8000-000000000003",
  task: "20000000-0000-4000-8000-000000000001",
  teamEvent: "30000000-0000-4000-8000-000000000001",
  siteEvent: "30000000-0000-4000-8000-000000000002",
};

const query = async <T,>(text: string) => (await client.query<T>(text)).rows;

beforeAll(async () => {
  // Migrations jusqu'à 0010 seulement : l'état d'avant l'isolation.
  folder = mkdtempSync(join(tmpdir(), "gepro-migrations-"));
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag !== "0012_isolation_projets");
  writeFileSync(journalPath, JSON.stringify(journal));

  client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder: folder });

  await client.exec(`
    insert into users (id, name, email, password_hash, role, created_at) values
      ('${ids.camille}', 'Camille', 'camille@exemple.fr', 'x', 'admin', now() - interval '3 days'),
      ('${ids.hugo}', 'Hugo', 'hugo@exemple.fr', 'x', 'member', now() - interval '2 days'),
      ('${ids.lea}', 'Léa', 'lea@exemple.fr', 'x', 'member', now() - interval '1 day'),
      ('${ids.nadia}', 'Nadia', 'nadia@exemple.fr', 'x', 'member', now());
    insert into projects (id, name, created_by, created_at) values
      ('${ids.site}', 'Site', '${ids.hugo}', now() - interval '3 days'),
      ('${ids.appli}', 'Appli', '${ids.lea}', now() - interval '2 days'),
      ('${ids.orphan}', 'Orphelin', null, now() - interval '1 day');
    insert into tasks (id, project_id, title, created_by) values ('${ids.task}', '${ids.site}', 'Maquettes', '${ids.hugo}');
    insert into task_assignees (task_id, user_id) values ('${ids.task}', '${ids.lea}');
    insert into project_events (id, project_id, title, event_date, created_by) values
      ('${ids.teamEvent}', null, 'Séminaire', '2026-10-01', '${ids.nadia}'),
      ('${ids.siteEvent}', '${ids.site}', 'Lancement', '2026-10-02', '${ids.hugo}');
    insert into work_sessions (user_id, project_id, started_at, ended_at) values
      ('${ids.nadia}', '${ids.appli}', now() - interval '2 hours', now() - interval '1 hour'),
      ('${ids.nadia}', null, now() - interval '4 hours', now() - interval '3 hours');
  `);
  // Toutes les migrations à appliquer : plus long qu'un test ordinaire quand la suite tourne en parallèle.
}, 30_000);

afterAll(async () => {
  await client.close();
  rmSync(folder, { recursive: true, force: true });
});

const members = () =>
  query<{ project_id: string; user_id: string; role: string }>(
    "select project_id, user_id, role::text as role from project_members order by project_id, user_id",
  );
const eventCount = async () => (await query<{ n: number }>("select count(*)::int as n from project_events"))[0].n;

describe("migration 0012_isolation_projets", () => {
  it("donne un propriétaire à chaque projet : créateur, sinon le plus ancien admin", async () => {
    await client.exec(MIGRATION);
    const owners = await query<{ id: string; owner_id: string }>("select id, owner_id from projects");
    expect(Object.fromEntries(owners.map((p) => [p.id, p.owner_id]))).toEqual({
      [ids.site]: ids.hugo,
      [ids.appli]: ids.lea,
      [ids.orphan]: ids.camille,
    });
  });

  it("reconstruit les membres : propriétaire + contributeurs, personne d'autre", async () => {
    expect(await members()).toEqual(
      [
        { project_id: ids.site, user_id: ids.hugo, role: "owner" },
        { project_id: ids.site, user_id: ids.lea, role: "member" },
        { project_id: ids.appli, user_id: ids.lea, role: "owner" },
        { project_id: ids.appli, user_id: ids.nadia, role: "member" },
        { project_id: ids.orphan, user_id: ids.camille, role: "owner" },
      ].sort((a, b) => a.project_id.localeCompare(b.project_id) || a.user_id.localeCompare(b.user_id)),
    );
  });

  it("rattache l'événement d'équipe au plus ancien projet et le copie dans les autres", async () => {
    const events = await query<{ id: string; project_id: string; title: string }>(
      "select id, project_id, title from project_events where title = 'Séminaire' order by project_id",
    );
    expect(events.map((e) => e.project_id).sort()).toEqual([ids.site, ids.appli, ids.orphan].sort());
    expect(events.find((e) => e.id === ids.teamEvent)?.project_id).toBe(ids.site);
    expect(await query("select 1 from project_events where project_id is null")).toEqual([]);
    // Aucune ligne supprimée ; le temps sans projet reste tel quel.
    expect(await eventCount()).toBe(4);
    expect(await query("select 1 from work_sessions")).toHaveLength(2);
  });

  it("est rejouable sans effet", async () => {
    const before = { members: await members(), events: await eventCount() };
    await client.exec(MIGRATION);
    expect({ members: await members(), events: await eventCount() }).toEqual(before);
  });

  it("se défait : événements d'équipe restaurés, tables retirées, puis se rejoue à l'identique", async () => {
    const applied = await members();
    await client.exec(ROLLBACK);
    expect(await query("select id from project_events where project_id is null")).toEqual([{ id: ids.teamEvent }]);
    expect(await eventCount()).toBe(2);
    expect(await query("select to_regclass('public.project_members') as t")).toEqual([{ t: null }]);
    // Défaire deux fois est sans effet.
    await client.exec(ROLLBACK);

    await client.exec(MIGRATION);
    expect(await members()).toEqual(applied);
    expect(await eventCount()).toBe(4);
  });
});
