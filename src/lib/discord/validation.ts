/** Validation des entrées des routes et actions Discord. */
import { z } from "zod";
import { isSnowflake } from "./snowflake";

/** Limite de Discord pour le contenu d'un message. */
export const MESSAGE_MAX_LENGTH = 2000;
/** Taille d'une page de messages (Discord en renvoie 100 au plus). */
export const PAGE_SIZE = 50;

const snowflake = z.string().refine(isSnowflake, "Identifiant Discord invalide");

export const sendMessageInput = z.object({
  content: z
    .string()
    .max(MESSAGE_MAX_LENGTH)
    .refine((s) => s.trim().length > 0),
});

export const readInput = z.object({ messageId: snowflake });

/** ?before=<id> | ?after=<id> (l'un ou l'autre) &limit=1..100 */
export const messagesQuery = z
  .object({
    before: snowflake.optional(),
    after: snowflake.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  })
  .refine((q) => !(q.before && q.after), "before et after sont exclusifs");
