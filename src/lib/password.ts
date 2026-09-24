/** Hachage des mots de passe (bcrypt). Séparé de auth.ts pour être utilisable par les scripts CLI. */
import bcrypt from "bcryptjs";

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
