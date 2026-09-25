import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readBody, withProjectDiscord } from "@/lib/discord/api";
import { listMessages, sendMessage } from "@/lib/discord/service";
import { messagesQuery, sendMessageInput } from "@/lib/discord/validation";

type Props = { params: Promise<{ id: string }> };

/**
 * Messages du salon, normalisés, du plus ancien au plus récent.
 * ?before=<id> : page précédente ; ?after=<id> : nouveaux messages ; sans : les derniers.
 */
export function GET(request: NextRequest, { params }: Props) {
  return withProjectDiscord(params, async ({ link }) => {
    const query = messagesQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return errorResponse("bad_request");
    return jsonResponse(await listMessages(link, query.data));
  });
}

/** Publie `{ content }` dans le salon au nom de la personne connectée (webhook du projet). */
export function POST(request: Request, { params }: Props) {
  return withProjectDiscord(params, async ({ user, link }) => {
    const input = sendMessageInput.safeParse(await readBody(request));
    if (!input.success) return errorResponse("invalid_message");
    // Les membres GePro n'ont pas de photo : Discord affiche l'avatar du webhook.
    const message = await sendMessage(link, { id: user.id, name: user.name }, input.data.content);
    return jsonResponse({ message }, 201);
  });
}
