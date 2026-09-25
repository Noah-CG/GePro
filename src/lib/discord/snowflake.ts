/**
 * Snowflakes Discord : entiers 64 bits transmis en texte. Au-delà de 2^53, un `Number` perd en
 * précision (deux identifiants voisins deviennent égaux) : on compare donc toujours en BigInt.
 * Un snowflake croît avec le temps : comparer deux ids de messages, c'est comparer leurs dates.
 */

/** 17 à 20 chiffres : tous les ids émis depuis 2015, jusqu'à la limite des 64 bits. */
const SNOWFLAKE = /^\d{17,20}$/;

/** Premier instant de 2015 (UTC), origine des horodatages Discord. */
const DISCORD_EPOCH = 1_420_070_400_000n;

export function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && SNOWFLAKE.test(value) && BigInt(value) < 2n ** 64n;
}

/** -1, 0 ou 1 selon que `a` est plus ancien, égal ou plus récent que `b`. */
export function compareSnowflakes(a: string, b: string): -1 | 0 | 1 {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Vrai si `id` est plus récent que `than` ; tout id est plus récent que « rien ». */
export function isNewer(id: string | null | undefined, than: string | null | undefined): boolean {
  if (!id) return false;
  return !than || compareSnowflakes(id, than) > 0;
}

/** Instant de création (ms depuis 1970) encodé dans un snowflake. */
export function snowflakeTime(id: string): number {
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

/** Trie des objets par id, du plus ancien au plus récent (copie). */
export function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareSnowflakes(a.id, b.id));
}
