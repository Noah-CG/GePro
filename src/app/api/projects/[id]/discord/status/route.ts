import { jsonResponse, withProjectDiscord } from "@/lib/discord/api";
import { getStatus } from "@/lib/discord/service";

type Props = { params: Promise<{ id: string }> };

/**
 * Pastille du bouton Discord : id du dernier message du salon et indicateur « non lu ».
 * Appel le plus léger possible (l'objet salon, en cache 3 s), interrogé toutes les 20 s.
 */
export function GET(_request: Request, { params }: Props) {
  return withProjectDiscord(params, async ({ user, link }) => jsonResponse(await getStatus(link, user.id)));
}
