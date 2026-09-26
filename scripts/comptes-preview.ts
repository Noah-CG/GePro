/**
 * Aperçu de la migration 0013_comptes_utilisateurs, en LECTURE SEULE : migrations déjà appliquées,
 * doublons d'email à la casse près (qui bloqueraient la migration), nom d'utilisateur proposé à
 * chaque compte. Mêmes règles que drizzle/0013_comptes_utilisateurs.sql.
 *
 *   npm run db:comptes-preview
 *
 * Sur la base configurée (Neon si DATABASE_URL, sinon ./.pglite). N'écrit rien.
 */
import "./env";
import { sql } from "drizzle-orm";
import { db, isLocalDb } from "../src/db";
import { suggestUsername } from "../src/lib/usernames";

type Row = Record<string, unknown>;
const rows = async <T extends Row>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;

const hasColumn = async (table: string, column: string) =>
  (
    await rows<{ ok: boolean }>(sql`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and column_name = ${column}
      ) as ok
    `)
  )[0].ok;

async function main() {
  console.log(`Base : ${isLocalDb ? "locale (.pglite)" : "Neon (DATABASE_URL)"}\n`);

  const [migrations] = await rows<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
  console.log(`Migrations appliquées : ${migrations.n} (13 attendues avant les comptes, 14 après)`);

  if (await hasColumn("users", "username")) {
    console.log("\nLa migration 0013 est déjà appliquée : noms d'utilisateur actuels.\n");
    const users = await rows<{ email: string; username: string | null; confirmed: boolean; verified: boolean }>(sql`
      select email, username, username_confirmed_at is not null as confirmed, email_verified_at is not null as verified
      from users order by created_at, id
    `);
    console.table(users);
    return;
  }
  if (!(await hasColumn("projects", "owner_id"))) {
    console.log("\n✖ La migration 0012_isolation_projets n'est pas appliquée : la 0013 refusera de s'appliquer.");
    process.exitCode = 1;
    return;
  }

  const duplicates = await rows<{ emails: string }>(sql`
    select string_agg(email, ', ' order by email) as emails from users group by lower(email) having count(*) > 1
  `);
  if (duplicates.length > 0) {
    console.log("\n✖ Emails en double à la casse près : la migration refusera de s'appliquer tant qu'ils existent.");
    for (const d of duplicates) console.log(`  - ${d.emails}`);
    process.exitCode = 1;
  } else {
    console.log("✔ Aucun email en double à la casse près.");
  }

  const users = await rows<{ id: string; name: string; email: string }>(sql`select id, name, email from users order by created_at, id`);
  const taken = new Set<string>();
  const proposals = [];
  for (const u of users) {
    const username = await suggestUsername(u.name, u.email, (c) => taken.has(c.toLowerCase()));
    taken.add(username.toLowerCase());
    proposals.push({ email: u.email, nom: u.name, "nom d'utilisateur proposé": username });
  }
  console.log(`\n${users.length} compte(s) : nom d'utilisateur proposé (modifiable à la première connexion), email marqué vérifié.\n`);
  console.table(proposals);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
