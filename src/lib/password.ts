/** Hachage des mots de passe (bcrypt). Séparé de auth.ts pour être utilisable par les scripts CLI. */
import bcrypt from "bcryptjs";

/** Coût bcrypt : identique pour tous les comptes, anciens (créés par un administrateur) et nouveaux. */
export const BCRYPT_COST = 10;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Comparaison factice, du même coût qu'une vraie : pour un identifiant inconnu, la connexion prend
 * autant de temps que pour un mauvais mot de passe, sans révéler quels comptes existent.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= bcrypt.hash("gepro-compte-inexistant", BCRYPT_COST);
  await bcrypt.compare(password, await dummyHash);
  return false;
}
