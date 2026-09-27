/**
 * Migration 0013_comptes_utilisateurs sur des données d'avant les comptes : aucun compte ni donnée
 * perdus ou recréés (mêmes id, emails, mots de passe), noms d'utilisateur proposés sans collision ;
 * rejouable, refusée en cas de doublons d'email ou d'ancienne version, réversible.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { splitName } from "@/lib/names";
import { RESERVED_USERNAMES, suggestUsername } from "@/lib/usernames";

const MIGRATION = readFileSync("drizzle/0013_comptes_utilisateurs.sql", "utf8");
const ROLLBACK = readFileSync("scripts/rollback/0013_comptes_utilisateurs.sql", "utf8");
const JOURNAL_WHEN = 1790501594117;

const folders: string[] = [];

/** Base migrée jusqu'à 0012 incluse : l'état de la production avant les comptes. */
async function databaseBeforeAccounts(): Promise<PGlite> {
  const folder = mkdtempSync(join(tmpdir(), "gepro-migrations-"));
  folders.push(folder);
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < "0013_comptes_utilisateurs");
  writeFileSync(journalPath, JSON.stringify(journal));
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder: folder });
  return client;
}

const ids = {
  camille: "00000000-0000-4000-8000-000000000001",
  camille2: "00000000-0000-4000-8000-000000000002",
  emilie: "00000000-0000-4000-8000-000000000003",
  jo: "00000000-0000-4000-8000-000000000004",
  admin: "00000000-0000-4000-8000-000000000005",
  symbols: "00000000-0000-4000-8000-000000000006",
  long: "00000000-0000-4000-8000-000000000007",
  site: "10000000-0000-4000-8000-000000000001",
  task: "20000000-0000-4000-8000-000000000001",
};

/** Comptes créés par un administrateur, du plus ancien au plus récent. */
const EXISTING = [
  { id: ids.camille, name: "Camille Martin", email: "camille@exemple.fr" },
  { id: ids.camille2, name: "Camille Martin", email: "camille.m@exemple.fr" },
  { id: ids.emilie, name: "Émilie Lœuvre-Ça", email: "emilie@exemple.fr" },
  { id: ids.jo, name: "Jo", email: "jo.smith@exemple.fr" },
  { id: ids.admin, name: "Admin", email: "direction@exemple.fr" },
  { id: ids.symbols, name: "!!", email: "x@exemple.fr" },
  { id: ids.long, name: "Marie-Charlotte de La Rochefoucauld-Liancourt", email: "mc@exemple.fr" },
];

async function insertExistingData(client: PGlite) {
  const values = EXISTING.map(
    (u, i) => `('${u.id}', '${u.name.replace(/'/g, "''")}', '${u.email}', '$2b$10$hash${i}', 'member', now() - interval '${10 - i} days')`,
  ).join(",\n");
  await client.exec(`
    insert into users (id, name, email, password_hash, role, created_at) values ${values};
    insert into sessions (id, user_id, expires_at) values ('session-hash', '${ids.camille}', now() + interval '1 day');
    insert into projects (id, name, created_by, owner_id) values ('${ids.site}', 'Site', '${ids.camille}', '${ids.camille}');
    insert into project_members (project_id, user_id, role) values ('${ids.site}', '${ids.camille}', 'owner'), ('${ids.site}', '${ids.emilie}', 'member');
    insert into project_invitations (project_id, email, token_hash, invited_by, expires_at)
      values ('${ids.site}', 'nouveau@exemple.fr', 'token-hash', '${ids.camille}', now() + interval '1 day');
    insert into tasks (id, project_id, title, created_by) values ('${ids.task}', '${ids.site}', 'Maquettes', '${ids.emilie}');
    insert into task_assignees (task_id, user_id) values ('${ids.task}', '${ids.jo}');
    insert into work_sessions (user_id, project_id, started_at, ended_at) values ('${ids.jo}', '${ids.site}', now() - interval '2 hours', now() - interval '1 hour');
    insert into discord_read_state (user_id, channel_id, last_read_message_id) values ('${ids.admin}', '1', '2');
  `);
}

const rows = async <T,>(client: PGlite, text: string) => (await client.query<T>(text)).rows;

/** Empreinte des données existantes : lignes de chaque table d'avant la migration + colonnes d'origine des comptes. */
async function fingerprint(client: PGlite) {
  const tables = await rows<{ t: string }>(
    client,
    `select table_name as t from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
       and table_name not in ('users', 'project_invitations', 'auth_throttle', 'project_invite_links', 'project_invite_link_uses')
     order by 1`,
  );
  const result: Record<string, string> = {};
  for (const { t } of tables) {
    const [row] = await rows<{ n: number; h: string | null }>(client, `select count(*)::int as n, md5(string_agg(md5(x::text), '' order by md5(x::text))) as h from "${t}" x`);
    result[t] = `${row.n}:${row.h}`;
  }
  const [users] = await rows<{ h: string }>(
    client,
    `select md5(string_agg(concat_ws('|', id, name, email, password_hash, role, color, created_at), ',' order by id)) as h from users`,
  );
  const [invitations] = await rows<{ h: string }>(
    client,
    `select md5(string_agg(concat_ws('|', id, project_id, email, role, token_hash, status, invited_by, expires_at), ',' order by id)) as h from project_invitations`,
  );
  return { ...result, users: users.h, project_invitations: invitations.h };
}

/** Lignes orphelines, toutes clés étrangères confondues (0 attendu). */
async function orphans(client: PGlite): Promise<string[]> {
  const fks = await rows<{ q: string; name: string }>(
    client,
    `select con.conname as name, format('select count(*)::int as n from %s e where %s and not exists (select 1 from %s p where %s)',
       con.conrelid::regclass,
       (select string_agg(format('e.%I is not null', a.attname), ' and ') from unnest(con.conkey) k join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k),
       con.confrelid::regclass,
       (select string_agg(format('p.%I = e.%I', pa.attname, ea.attname), ' and ')
          from unnest(con.conkey, con.confkey) as u(ek, pk)
          join pg_attribute ea on ea.attrelid = con.conrelid and ea.attnum = u.ek
          join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = u.pk)) as q
     from pg_constraint con where con.contype = 'f' and con.connamespace = 'public'::regnamespace`,
  );
  const bad: string[] = [];
  for (const fk of fks) if ((await rows<{ n: number }>(client, fk.q))[0].n > 0) bad.push(fk.name);
  return bad;
}

const userForeignKeys = (client: PGlite) =>
  rows<{ name: string }>(
    client,
    `select conname as name from pg_constraint where contype = 'f' and confrelid = 'public.users'::regclass order by 1`,
  );

let client: PGlite;
let before: Awaited<ReturnType<typeof fingerprint>>;
let fksBefore: { name: string }[];

beforeAll(async () => {
  client = await databaseBeforeAccounts();
  await insertExistingData(client);
  before = await fingerprint(client);
  fksBefore = await userForeignKeys(client);
  await client.exec(MIGRATION);
}, 120_000);

afterAll(async () => {
  await client.close();
  for (const f of folders) rmSync(f, { recursive: true, force: true });
});

describe("migration 0013_comptes_utilisateurs", () => {
  it("ne perd, ne recrée ni ne modifie aucune donnée existante (mêmes id, emails, mots de passe)", async () => {
    expect(await fingerprint(client)).toEqual(before);
    const users = await rows<{ id: string; email: string }>(client, "select id, email from users order by created_at");
    expect(users).toEqual(EXISTING.map(({ id, email }) => ({ id, email })));
  });

  it("garde intactes toutes les clés étrangères vers users (et n'en ajoute que de nouvelles)", async () => {
    const after = (await userForeignKeys(client)).map((f) => f.name);
    expect(fksBefore).toHaveLength(17);
    for (const { name } of fksBefore) expect(after).toContain(name);
    expect(await orphans(client)).toEqual([]);
    const [{ n }] = await rows<{ n: number }>(client, "select count(*)::int as n from pg_constraint where contype = 'f' and not convalidated");
    expect(n).toBe(0);
  });

  it("propose un nom d'utilisateur à chacun : sans collision, sans nom réservé, comme suggestUsername", async () => {
    const users = await rows<{ id: string; username: string; username_confirmed_at: Date | null }>(
      client,
      "select id, username, username_confirmed_at from users order by created_at, id",
    );
    expect(Object.fromEntries(users.map((u) => [u.id, u.username]))).toEqual({
      [ids.camille]: "camille-martin",
      [ids.camille2]: "camille-martin-2",
      [ids.emilie]: "emilie-loeuvre-ca",
      [ids.jo]: "jo-smith",
      [ids.admin]: "admin-2",
      [ids.symbols]: "membre",
      [ids.long]: "marie-charlotte-de-la-rochefou",
    });
    // À confirmer (ou modifier) à la première connexion.
    expect(users.every((u) => u.username_confirmed_at === null)).toBe(true);

    // Mêmes règles que l'application (comptes créés par un administrateur).
    const taken = new Set<string>();
    for (const u of EXISTING) {
      const s = await suggestUsername(u.name, u.email, (c) => taken.has(c.toLowerCase()));
      taken.add(s);
      expect(s).toBe(users.find((x) => x.id === u.id)!.username);
    }
  });

  it("sépare prénom et nom sur le premier espace ; le nom affiché (users.name) reste identique", async () => {
    const users = await rows<{ id: string; first_name: string; last_name: string; name: string }>(
      client,
      "select id, first_name, last_name, name from users order by created_at, id",
    );
    expect(users.map(({ first_name, last_name, name }) => ({ first_name, last_name, name }))).toEqual([
      { first_name: "Camille", last_name: "Martin", name: "Camille Martin" },
      { first_name: "Camille", last_name: "Martin", name: "Camille Martin" },
      { first_name: "Émilie", last_name: "Lœuvre-Ça", name: "Émilie Lœuvre-Ça" },
      // Un seul mot : prénom seul, nom vide.
      { first_name: "Jo", last_name: "", name: "Jo" },
      { first_name: "Admin", last_name: "", name: "Admin" },
      { first_name: "!!", last_name: "", name: "!!" },
      { first_name: "Marie-Charlotte", last_name: "de La Rochefoucauld-Liancourt", name: "Marie-Charlotte de La Rochefoucauld-Liancourt" },
    ]);
    // Même règle que l'application.
    for (const u of users) expect(splitName(u.name)).toEqual({ firstName: u.first_name, lastName: u.last_name });
  });

  it("users.name est calculé par Postgres : suit le prénom et le nom, jamais écrit directement", async () => {
    await client.exec(`update users set last_name = 'Durand' where id = '${ids.jo}'`);
    expect(await rows(client, `select name from users where id = '${ids.jo}'`)).toEqual([{ name: "Jo Durand" }]);
    await client.exec(`update users set last_name = '' where id = '${ids.jo}'`);
    await expect(client.exec(`update users set name = 'X' where id = '${ids.jo}'`)).rejects.toThrow(/name/);
  });

  it("impose l'unicité sans tenir compte de la casse, et le format du nom d'utilisateur", async () => {
    await expect(client.exec(`update users set email = 'CAMILLE@exemple.fr' where id = '${ids.camille2}'`)).rejects.toThrow(/users_email_lower_uq/);
    await expect(client.exec(`update users set username = 'CAMILLE-MARTIN' where id = '${ids.camille2}'`)).rejects.toThrow(/users_username_lower_uq/);
    await expect(client.exec(`update users set username = 'a b' where id = '${ids.camille2}'`)).rejects.toThrow(/users_username_format/);
  });

  it("invitation : email ou compte, jamais les deux, jamais aucun", async () => {
    const insert = (email: string, user: string) =>
      client.exec(`insert into project_invitations (project_id, email, invited_user_id, token_hash, expires_at)
                   values ('${ids.site}', ${email}, ${user}, md5(random()::text), now() + interval '1 day')`);
    await expect(insert("'a@exemple.fr'", `'${ids.jo}'`)).rejects.toThrow(/project_invitations_one_target/);
    await expect(insert("null", "null")).rejects.toThrow(/project_invitations_one_target/);
    await insert("null", `'${ids.jo}'`);
    await client.exec("delete from project_invitations where invited_user_id is not null");
  });

  it("est rejouable sans effet", async () => {
    const snapshot = await rows(client, "select id, username, username_confirmed_at from users order by id");
    await client.exec(MIGRATION);
    expect(await rows(client, "select id, username, username_confirmed_at from users order by id")).toEqual(snapshot);
  });

  it("utilise la même liste de noms réservés que l'application", () => {
    const sqlList = /reserved text\[\] := ARRAY\[([\s\S]*?)\];/.exec(MIGRATION)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(sqlList).toEqual([...RESERVED_USERNAMES]);
  });
});

describe("migration 0013 : garde-fous", () => {
  it("refuse de s'appliquer si un nom ne se découpe pas sans perte, en le listant, sans rien modifier", async () => {
    const db = await databaseBeforeAccounts();
    await db.exec(`insert into users (name, email, password_hash) values ('Jean ', 'jean@exemple.fr', 'x'), ('Léa  Dubois', 'lea@exemple.fr', 'x')`);
    await expect(db.exec(MIGRATION)).rejects.toThrow(/noms impossibles à découper.*jean@exemple.fr.*lea@exemple.fr/);
    const [{ n }] = await rows<{ n: number }>(db, "select count(*)::int as n from information_schema.columns where table_name = 'users' and column_name in ('username', 'first_name')");
    expect(n).toBe(0);
    expect(await rows(db, "select name from users order by email")).toEqual([{ name: "Jean " }, { name: "Léa  Dubois" }]);
    await db.close();
  }, 120_000);

  it("refuse de s'appliquer s'il existe des emails en double à la casse près, en les listant, sans rien modifier", async () => {
    const db = await databaseBeforeAccounts();
    await db.exec(`insert into users (name, email, password_hash) values ('A', 'Double@exemple.fr', 'x'), ('B', 'double@exemple.fr', 'x')`);
    await expect(db.exec(MIGRATION)).rejects.toThrow(/emails en double.*Double@exemple\.fr, double@exemple\.fr/);
    const [{ n }] = await rows<{ n: number }>(db, "select count(*)::int as n from information_schema.columns where table_name = 'users' and column_name = 'username'");
    expect(n).toBe(0);
    expect(await rows(db, "select to_regclass('public.auth_throttle') as t")).toEqual([{ t: null }]);
    await db.close();
  }, 120_000);
});

describe("retour arrière de la migration 0013", () => {
  it("retire colonnes et tables ajoutées, garde tous les comptes et leurs données, et peut être réappliqué", async () => {
    const db = await databaseBeforeAccounts();
    await insertExistingData(db);
    const initial = await fingerprint(db);
    await db.exec(MIGRATION);
    await db.exec(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('0013', ${JOURNAL_WHEN})`);
    // Données créées après la mise en production : un compte inscrit, une invitation par nom d'utilisateur.
    await db.exec(`
      insert into users (first_name, last_name, email, password_hash, username) values ('Nadia', 'Rahmani', 'nadia@exemple.fr', 'x', 'nadia');
      insert into project_invitations (project_id, invited_user_id, token_hash, expires_at)
        select '${ids.site}', id, 'by-username', now() + interval '1 day' from users where username = 'nadia';
    `);

    await db.exec(ROLLBACK);
    const columns = await rows<{ c: string }>(db, "select column_name as c from information_schema.columns where table_name = 'users' order by 1");
    expect(columns.map((c) => c.c)).not.toContain("username");
    expect(await rows(db, "select to_regclass('public.project_invite_links') as t")).toEqual([{ t: null }]);
    expect(await rows(db, `select count(*)::int as n from drizzle.__drizzle_migrations where created_at = ${JOURNAL_WHEN}`)).toEqual([{ n: 0 }]);

    // Aucun compte supprimé, pas même celui créé après la migration ; données d'origine intactes.
    const after = await fingerprint(db);
    const users = await rows<{ email: string }>(db, "select email from users order by email");
    expect(users.map((u) => u.email)).toContain("nadia@exemple.fr");
    expect(users).toHaveLength(EXISTING.length + 1);
    const { users: _u1, ...initialRest } = initial;
    const { users: _u2, ...afterRest } = after;
    expect(afterRest).toEqual(initialRest);
    expect(await orphans(db)).toEqual([]);

    // Sans effet une deuxième fois, et la migration se réapplique.
    await db.exec(ROLLBACK);
    await db.exec(MIGRATION);
    expect(await rows(db, "select count(*)::int as n from users where username is null")).toEqual([{ n: 0 }]);
    await db.close();
  }, 120_000);
});

describe("migration 0013 : ancienne version de développement (avec vérification d'email)", () => {
  it("refuse de s'appliquer par-dessus, et le retour arrière la défait entièrement", async () => {
    const db = await databaseBeforeAccounts();
    await insertExistingData(db);
    const initial = await fingerprint(db);
    // Ce que l'ancienne version ajoutait en plus : jetons par email et users.email_verified_at.
    await db.exec(MIGRATION);
    await db.exec(`
      alter table users add column email_verified_at timestamp with time zone;
      create table email_verification_tokens (id uuid primary key, user_id uuid references users(id) on delete cascade);
      create table password_reset_tokens (id uuid primary key, user_id uuid references users(id) on delete cascade);
      insert into drizzle.__drizzle_migrations (hash, created_at) values ('ancienne', 1790455614209);
    `);

    await expect(db.exec(MIGRATION)).rejects.toThrow(/ancienne version.*db:comptes-rollback/);

    await db.exec(ROLLBACK);
    expect(await rows(db, "select to_regclass('public.email_verification_tokens') as a, to_regclass('public.password_reset_tokens') as b")).toEqual([
      { a: null, b: null },
    ]);
    expect(await rows(db, "select count(*)::int as n from information_schema.columns where table_name = 'users' and column_name in ('email_verified_at', 'username')")).toEqual([
      { n: 0 },
    ]);
    expect(await rows(db, "select count(*)::int as n from drizzle.__drizzle_migrations where created_at = 1790455614209")).toEqual([{ n: 0 }]);
    const { users: _a, ...before } = initial;
    const { users: _b, ...after } = await fingerprint(db);
    expect(after).toEqual(before);

    // La nouvelle version s'applique ensuite normalement.
    await db.exec(MIGRATION);
    expect(await rows(db, "select count(*)::int as n from users where username is null")).toEqual([{ n: 0 }]);
    await db.close();
  }, 120_000);
});
