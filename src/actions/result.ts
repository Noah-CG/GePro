/** Résultat uniforme renvoyé par les Server Actions au client. */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });
