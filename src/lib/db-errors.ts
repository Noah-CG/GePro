/** Erreurs Postgres reconnues par l'application (Neon et PGlite les exposent avec le même code). */

type PgLikeError = { code?: unknown; constraint?: unknown; cause?: unknown };

/** Erreur Postgres d'origine, éventuellement enveloppée par Drizzle (`cause`). */
function pgError(err: unknown): PgLikeError | null {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 5; depth++) {
    const candidate = e as PgLikeError;
    if (typeof candidate.code === "string") return candidate;
    e = candidate.cause;
  }
  return null;
}

/** Violation d'unicité (23505), éventuellement sur un index ou une contrainte précise. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = pgError(err);
  if (!e || e.code !== "23505") return false;
  if (!constraint) return true;
  const detail = err instanceof Error ? `${err.message} ${String((err.cause as Error | undefined)?.message ?? "")}` : "";
  return e.constraint === constraint || detail.includes(constraint);
}
