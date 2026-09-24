/**
 * Création d'un compte en ligne de commande (utile pour le tout premier administrateur).
 *
 *   npm run user:create -- --name "Alice Durand" --email alice@societe.fr --password "motdepasse" [--admin]
 */
import "./env";
import { eq } from "drizzle-orm";
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
    name: arg("name"),
    email: arg("email"),
    password: arg("password"),
    role: process.argv.includes("--admin") ? "admin" : "member",
  });
  if (!parsed.success) {
    console.error("Paramètres invalides :", parsed.error.issues.map((i) => `${i.path.join(".")} → ${i.message}`).join(", "));
    console.error('Usage : npm run user:create -- --name "Nom Prénom" --email x@y.fr --password "8+ caractères" [--admin]');
    process.exit(1);
  }
  const { password, ...data } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (existing) {
    console.error(`Un compte existe déjà pour ${data.email}.`);
    process.exit(1);
  }

  const count = (await db.select({ id: users.id }).from(users)).length;
  await db.insert(users).values({ ...data, passwordHash: await hashPassword(password), color: COLORS[count % COLORS.length] });
  console.log(`✔ Compte ${data.role === "admin" ? "administrateur " : ""}créé : ${data.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
