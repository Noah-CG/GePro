/**
 * Prénom et nom d'un compte. users.name (« Prénom Nom ») est calculé par Postgres à partir de
 * first_name et last_name : `fullName` en donne la même valeur côté application.
 */

/**
 * Découpe un nom complet sur le premier espace : prénom = premier mot, nom = le reste (vide s'il
 * n'y a qu'un mot). Même règle que la migration 0013 pour les comptes existants.
 */
export function splitName(name: string): { firstName: string; lastName: string } {
  const space = name.indexOf(" ");
  return space < 0 ? { firstName: name, lastName: "" } : { firstName: name.slice(0, space), lastName: name.slice(space + 1) };
}

/** « Prénom Nom », ou le prénom seul si le nom est vide (comme la colonne users.name). */
export const fullName = (firstName: string, lastName: string) => (lastName ? `${firstName} ${lastName}` : firstName);
