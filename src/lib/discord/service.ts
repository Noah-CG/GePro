/**
 * Salon Discord d'un projet : rattachement (vérification + webhook), lecture des messages,
 * envoi, état de lecture. Seul module (avec client.ts) à manipuler le jeton du webhook.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { discordReadState, projectDiscord, type ProjectDiscord } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  createWebhook,
  executeWebhook,
  getChannel,
  getChannelWebhooks,
  getGuild,
  getGuildChannels,
  getGuildRoles,
  getMessages,
} from "./client";
import { DiscordError } from "./errors";
import type { DiscordChannelView, DiscordMessage, DiscordMessagesPage, DiscordStatus } from "./model";
import { needsGuildLookup, normalizeMessage, normalizeMessages, type NormalizeContext } from "./normalize";
import { isNewer } from "./snowflake";
import { CHANNEL_TYPES, WEBHOOK_TYPE_INCOMING, type APIWebhook } from "./types";

/** Nom du webhook créé (ou réutilisé) dans chaque salon relié. */
export const WEBHOOK_NAME = "GePro";

export type ProjectDiscordLink = ProjectDiscord;

export async function getProjectDiscord(projectId: string): Promise<ProjectDiscordLink | null> {
  const [row] = await db.select().from(projectDiscord).where(eq(projectDiscord.projectId, projectId)).limit(1);
  return row ?? null;
}

/** Salon relié, sans aucun secret : transmissible au navigateur. */
export async function getDiscordChannelView(projectId: string): Promise<DiscordChannelView | null> {
  const [row] = await db
    .select({ guildId: projectDiscord.guildId, channelId: projectDiscord.channelId, channelName: projectDiscord.channelName })
    .from(projectDiscord)
    .where(eq(projectDiscord.projectId, projectId))
    .limit(1);
  return row ?? null;
}

// Rattachement

/**
 * Relie un salon au projet (ou remplace le salon actuel) : vérifie que le bot voit le salon,
 * récupère le serveur, puis réutilise le webhook « GePro » du salon ou en crée un.
 */
export async function linkChannel(projectId: string, channelId: string, userId: string): Promise<DiscordChannelView> {
  const channel = await getChannel(channelId, { fresh: true });
  if (!channel.guild_id || !(Object.values(CHANNEL_TYPES) as number[]).includes(channel.type)) {
    throw new DiscordError("not_text_channel", `type ${channel.type}`);
  }
  const webhook = await ensureWebhook(channelId);
  const values = {
    guildId: channel.guild_id,
    channelId,
    channelName: channel.name ?? channelId,
    webhookId: webhook.id,
    webhookTokenEnc: encryptSecret(webhook.token),
    linkedBy: userId,
  };
  await db
    .insert(projectDiscord)
    .values({ projectId, ...values })
    .onConflictDoUpdate({ target: projectDiscord.projectId, set: { ...values, createdAt: new Date() } });
  return { guildId: values.guildId, channelId, channelName: values.channelName };
}

/**
 * Délie le salon. Le webhook reste sur Discord : un autre projet relié au même salon peut
 * l'utiliser, et le rattacher de nouveau le réutilisera.
 */
export async function unlinkChannel(projectId: string): Promise<void> {
  await db.delete(projectDiscord).where(eq(projectDiscord.projectId, projectId));
}

/** Webhook « GePro » du salon (entrant, avec son jeton), créé s'il n'existe pas. */
async function ensureWebhook(channelId: string): Promise<APIWebhook & { token: string }> {
  const existing = (await getChannelWebhooks(channelId)).find(
    (w): w is APIWebhook & { token: string } => w.type === WEBHOOK_TYPE_INCOMING && w.name === WEBHOOK_NAME && !!w.token,
  );
  if (existing) return existing;
  const created = await createWebhook(channelId, WEBHOOK_NAME);
  if (!created.token) throw new DiscordError("unknown", "webhook créé sans jeton");
  return { ...created, token: created.token };
}

/**
 * Précise une erreur d'accès : Discord répond « Missing Access » aussi bien quand le bot n'a pas
 * la permission de voir le salon que quand il a été retiré du serveur.
 */
export async function diagnoseAccessError(error: unknown, guildId: string): Promise<unknown> {
  if (!(error instanceof DiscordError) || !["missing_access", "channel_not_found"].includes(error.code)) return error;
  try {
    await getGuild(guildId);
    return error;
  } catch (e) {
    return e instanceof DiscordError && ["missing_access", "bot_not_in_guild", "channel_not_found"].includes(e.code)
      ? new DiscordError("bot_not_in_guild", error.message)
      : error;
  }
}

// Lecture

/** Dernier message du salon et indicateur « non lu » pour ce membre. */
export async function getStatus(link: ProjectDiscordLink, userId: string): Promise<DiscordStatus> {
  const [channel, lastRead] = await Promise.all([getChannel(link.channelId), getLastRead(userId, link.channelId)]);
  // Salon renommé sur Discord : on met la copie à jour (écriture seulement en cas de changement).
  if (channel.name && channel.name !== link.channelName) {
    await db.update(projectDiscord).set({ channelName: channel.name }).where(eq(projectDiscord.projectId, link.projectId));
  }
  const lastMessageId = channel.last_message_id ?? null;
  return { lastMessageId, unread: isNewer(lastMessageId, lastRead) };
}

export async function listMessages(
  link: ProjectDiscordLink,
  params: { before?: string; after?: string; limit: number },
): Promise<DiscordMessagesPage> {
  const raw = await getMessages(link.channelId, params);
  const ctx = await normalizeContext(link, needsGuildLookup(raw));
  return { messages: normalizeMessages(raw, ctx), hasMore: raw.length >= params.limit };
}

/** Rôles et salons du serveur, chargés seulement si des mentions les citent (listes en cache 5 min). */
async function normalizeContext(link: ProjectDiscordLink, lookup: { roles: boolean; channels: boolean }): Promise<NormalizeContext> {
  // Liste indisponible (permission, limite de débit) : la mention s'affiche sans nom, le message reste lisible.
  const [roles, channels] = await Promise.all([
    lookup.roles ? getGuildRoles(link.guildId).catch(() => []) : [],
    lookup.channels ? getGuildChannels(link.guildId).catch(() => []) : [],
  ]);
  return {
    webhookId: link.webhookId,
    roles: new Map(roles.map((r) => [r.id, r])),
    channels: new Map(channels.flatMap((c) => (c.name ? [[c.id, c.name] as const] : []))),
  };
}

// Envoi

/**
 * Pseudo affiché sur Discord : le nom du membre GePro. Discord refuse les pseudos de webhook
 * contenant « discord », « clyde », « ``` », @, # ou :, et limite leur longueur à 80.
 */
export function webhookUsername(name: string): string {
  const cleaned = name
    .replace(/discord|clyde/gi, "")
    .replace(/```|[@#:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned && !/^(everyone|here)$/i.test(cleaned) ? cleaned : "Membre GePro";
}

/**
 * Publie un message au nom du membre, via le webhook du projet, sans notifier personne
 * (`allowed_mentions` vide). Si le webhook a été supprimé côté Discord, il est recréé une fois.
 * Le message envoyé est marqué comme lu : il ne déclenche pas la pastille de son auteur.
 */
export async function sendMessage(
  link: ProjectDiscordLink,
  author: { id: string; name: string; avatarUrl?: string | null },
  content: string,
): Promise<DiscordMessage> {
  const payload = {
    content,
    username: webhookUsername(author.name),
    ...(author.avatarUrl ? { avatar_url: author.avatarUrl } : {}),
    allowed_mentions: { parse: [] },
  };

  let webhookId = link.webhookId;
  let message;
  try {
    message = await executeWebhook(webhookId, decryptSecret(link.webhookTokenEnc), payload);
  } catch (e) {
    if (!(e instanceof DiscordError) || e.code !== "webhook_missing") throw e;
    const webhook = await ensureWebhook(link.channelId);
    await db
      .update(projectDiscord)
      .set({ webhookId: webhook.id, webhookTokenEnc: encryptSecret(webhook.token) })
      .where(eq(projectDiscord.channelId, link.channelId));
    webhookId = webhook.id;
    message = await executeWebhook(webhook.id, webhook.token, payload);
  }

  await markRead(author.id, link.channelId, message.id);
  return normalizeMessage(message, { webhookId, roles: new Map(), channels: new Map() });
}

// État de lecture

export async function getLastRead(userId: string, channelId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: discordReadState.lastReadMessageId })
    .from(discordReadState)
    .where(and(eq(discordReadState.userId, userId), eq(discordReadState.channelId, channelId)))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Avance le dernier message lu, jamais en arrière (deux onglets, requêtes croisées…). La
 * comparaison se fait dans Postgres en `numeric` : exacte sur 64 bits et atomique, sans
 * transaction (le driver HTTP de Neon n'en propose pas).
 */
export async function markRead(userId: string, channelId: string, messageId: string): Promise<void> {
  await db
    .insert(discordReadState)
    .values({ userId, channelId, lastReadMessageId: messageId })
    .onConflictDoUpdate({
      target: [discordReadState.userId, discordReadState.channelId],
      set: { lastReadMessageId: messageId },
      setWhere: sql`${discordReadState.lastReadMessageId}::numeric < ${messageId}::numeric`,
    });
}
