"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isDiscordConfigured } from "@/lib/discord/client";
import { DiscordError, discordErrorMessage } from "@/lib/discord/errors";
import type { DiscordChannelView } from "@/lib/discord/model";
import { linkChannel, unlinkChannel } from "@/lib/discord/service";
import { parseChannelInput } from "@/lib/discord/urls";
import { isUuid } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

// Le layout aussi : l'onglet fixe Discord de la barre d'onglets dépend du salon relié.
const refresh = () => revalidatePath("/", "layout");

async function projectExists(projectId: string): Promise<boolean> {
  if (!isUuid(projectId)) return false;
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return !!row;
}

/**
 * Relie un salon Discord au projet (id du salon ou lien https://discord.com/channels/…), ou
 * remplace le salon actuel. Le serveur vérifie l'accès du bot et prépare le webhook « GePro ».
 */
export async function linkDiscordChannel(projectId: string, input: string): Promise<ActionResult<DiscordChannelView>> {
  const me = await requireUser();
  if (!(await projectExists(projectId))) return fail("Projet introuvable.");
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
  await requireUser();
  if (!(await projectExists(projectId))) return fail("Projet introuvable.");
  await unlinkChannel(projectId);
  refresh();
  return ok(undefined);
}
