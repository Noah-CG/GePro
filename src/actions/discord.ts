"use server";

import { revalidatePath } from "next/cache";
import { authorizeProject } from "@/lib/access";
import { isDiscordConfigured } from "@/lib/discord/client";
import { DiscordError, discordErrorMessage } from "@/lib/discord/errors";
import type { DiscordChannelView } from "@/lib/discord/model";
import { linkChannel, prepareLink, unlinkChannel } from "@/lib/discord/service";
import { parseChannelInput } from "@/lib/discord/urls";
import { fail, ok, type ActionResult } from "./result";

// Le layout aussi : l'onglet fixe Discord de la barre d'onglets dépend du salon relié.
const refresh = () => revalidatePath("/", "layout");

const failWith = (e: unknown) => {
  const code = e instanceof DiscordError ? e.code : "unknown";
  if (code === "unknown" || code === "invalid_token") console.error("[discord]", e);
  return fail(discordErrorMessage(code));
};

/**
 * Première étape du rattachement (id du salon ou lien https://discord.com/channels/…) : vérifie
 * que le bot voit le salon et renvoie le code que la personne doit y publier depuis son compte
 * Discord, pour prouver qu'elle a accès au salon. Propriétaire et administrateurs du projet.
 */
export async function prepareDiscordLink(projectId: string, input: string): Promise<ActionResult<{ channelName: string; code: string }>> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  if (!isDiscordConfigured()) return fail(discordErrorMessage("not_configured"));
  const channelId = parseChannelInput(input);
  if (!channelId) return fail(discordErrorMessage("invalid_channel"));
  try {
    return ok(await prepareLink(projectId, channelId, auth.access.user.id));
  } catch (e) {
    return failWith(e);
  }
}

/**
 * Relie le salon au projet, ou remplace le salon actuel, une fois le code de vérification publié
 * dans le salon (voir `prepareDiscordLink`). Le serveur prépare le webhook « GePro ».
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
    return failWith(e);
  }
}

export async function unlinkDiscordChannel(projectId: string): Promise<ActionResult> {
  const auth = await authorizeProject(projectId, "admin");
  if (!auth.ok) return fail(auth.error);
  await unlinkChannel(projectId);
  refresh();
  return ok(undefined);
}
