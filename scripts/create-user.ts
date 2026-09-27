/**
 * Création d'un compte en ligne de commande (utile pour le tout premier administrateur).
 *
 *   npm run user:create -- --prenom "Alice" --nom "Durand" --email alice@societe.fr --password "motdepasse" [--admin]
 */
import "./env";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { COLORS } from "../src/lib/constants";
import { hashPassword } from "../src/lib/password";
import { memberInput } from "../src/lib/validation";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const parsed = memberInput.safeParse({
    firstName: arg("prenom"),
    lastName: arg("nom"),
    email: arg("email"),
    password: arg("password"),
    role: process.argv.includes("--admin") ? "admin" : "member",
  });
  if (!parsed.success) {
    console.error("Paramètres invalides :", parsed.error.issues.map((i) => `${i.path.join(".")} → ${i.message}`).join(", "));
    console.error('Usage : npm run user:create -- --prenom "Prénom" --nom "Nom" --email x@y.fr --password "10+ caractères" [--admin]');
    process.exit(1);
  }
  const { password, ...data } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${data.email}`);
  if (existing) {
    console.error(`Un compte existe déjà pour ${data.email}.`);
    process.exit(1);
  }

  const all = await db.select({ id: users.id }).from(users);
  await db.insert(users).values({
    ...data,
    passwordHash: await hashPassword(password),
    color: COLORS[all.length % COLORS.length],
  });
  console.log(`✔ Compte ${data.role === "admin" ? "administrateur " : ""}créé : ${data.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
