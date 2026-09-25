import { errorResponse, jsonResponse, readBody, withProjectDiscord } from "@/lib/discord/api";
import { markRead } from "@/lib/discord/service";
import { readInput } from "@/lib/discord/validation";

type Props = { params: Promise<{ id: string }> };

/** Marque le salon comme lu jusqu'à `{ messageId }` (sans effet si un message plus récent l'est déjà). */
export function POST(request: Request, { params }: Props) {
  return withProjectDiscord(params, async ({ user, link }) => {
    const input = readInput.safeParse(await readBody(request));
    if (!input.success) return errorResponse("bad_request");
    await markRead(user.id, link.channelId, input.data.messageId);
    return jsonResponse({ ok: true });
  });
}
