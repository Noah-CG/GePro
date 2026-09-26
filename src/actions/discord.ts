"use server";

import { revalidatePath } from "next/cache";
import { authorizeProject } from "@/lib/access";
import { isDiscordConfigured } from "@/lib/discord/client";
import { DiscordError, discordErrorMessage } from "@/lib/discord/errors";
import type { DiscordChannelView } from "@/lib/discord/model";
import { linkChannel, unlinkChannel } from "@/lib/discord/service";
import { parseChannelInput } from "@/lib/discord/urls";
import { fail, ok, type ActionResult } from "./result";

// Le layout aussi : l'onglet fixe Discord de la barre d'onglets dépend du salon relié.
const refresh = () => revalidatePath("/", "layout");

/**
 * Relie un salon Discord au projet (id du salon ou lien https://discord.com/channels/…), ou
 * remplace le salon actuel. Le serveur vérifie l'accès du bot et prépare le webhook « GePro ».
 * Réglage du projet : propriétaire et administrateurs.
 */
export async function linkDiscordChannel(projectId: string, input: string): Promise<ActionResult<DiscordChannelView>> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  const me = auth.access.user;
  if (!isDiscordConfigured()) return fail(discordErrorMessage("not_configured"));
  const channelId = parseChannelInput(input);
  if (!channelId) return fail(discordErrorMessage("invalid_channel"));

  try {
    const channel = await linkChannel(projectId, channelId, me.id);
    refresh();
    return ok(channel);
  } catch (e) {
    const code = e instanceof DiscordError ? e.code : "unknown";
    if (code === "unknown" || code === "invalid_token") console.error("[discord]", e);
    return fail(discordErrorMessage(code));
  }
}

export async function unlinkDiscordChannel(projectId: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  await unlinkChannel(projectId);
  refresh();
  return ok(undefined);
}
