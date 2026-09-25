/**
 * Conversion des messages bruts de Discord au format envoyé au navigateur (model.ts) : seuls
 * les champs utiles, liens vérifiés, mentions résolues en noms. Fonctions pures, sans réseau.
 */
import type { DiscordAttachment, DiscordEmbed, DiscordMentions, DiscordMessage } from "./model";
import { sortById } from "./snowflake";
import { MESSAGE_TYPES, type APIAttachment, type APIEmbed, type APIMessage, type APIUser } from "./types";
import { avatarUrl, safeUrl } from "./urls";

/** Contexte de normalisation : webhook du projet, rôles et salons du serveur (id → infos). */
export type NormalizeContext = {
  webhookId: string;
  roles: ReadonlyMap<string, { name: string; color: number }>;
  channels: ReadonlyMap<string, string>;
};

const DISPLAYED_TYPES = new Set<number>(Object.values(MESSAGE_TYPES));

/** Messages affichés (messages système exclus : arrivées, épinglages…), du plus ancien au plus récent. */
export function normalizeMessages(messages: readonly APIMessage[], ctx: NormalizeContext): DiscordMessage[] {
  return sortById(messages.filter((m) => DISPLAYED_TYPES.has(m.type))).map((m) => normalizeMessage(m, ctx));
}

export function normalizeMessage(m: APIMessage, ctx: NormalizeContext): DiscordMessage {
  return {
    id: m.id,
    content: m.content,
    author: {
      id: m.author.id,
      name: displayName(m.author),
      avatarUrl: avatarUrl(m.author),
      // Les messages de webhooks sont marqués « bot » par Discord.
      isBot: m.author.bot === true,
    },
    fromGePro: m.webhook_id !== undefined && m.webhook_id === ctx.webhookId,
    timestamp: m.timestamp,
    editedTimestamp: m.edited_timestamp,
    attachments: m.attachments.flatMap(normalizeAttachment),
    embeds: m.embeds.flatMap(normalizeEmbed),
    mentions: resolveMentions(m, ctx),
  };
}

export const displayName = (user: APIUser) => user.global_name?.trim() || user.username;

const IMAGE_TYPES = /^image\/(?:png|jpe?g|gif|webp|avif)$/i;
const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|avif)$/i;

function normalizeAttachment(a: APIAttachment): DiscordAttachment[] {
  const url = safeUrl(a.url);
  if (!url) return [];
  const isImage = a.content_type ? IMAGE_TYPES.test(a.content_type) : IMAGE_EXTENSIONS.test(a.filename);
  return [{ id: a.id, filename: a.filename, url, size: a.size, isImage, width: a.width ?? null, height: a.height ?? null }];
}

function normalizeEmbed(e: APIEmbed): DiscordEmbed[] {
  const embed: DiscordEmbed = {
    title: e.title?.trim() || null,
    url: safeUrl(e.url),
    description: e.description?.trim() || null,
    color: typeof e.color === "number" ? `#${e.color.toString(16).padStart(6, "0")}` : null,
    authorName: e.author?.name?.trim() || null,
    footer: e.footer?.text?.trim() || null,
    imageUrl: safeUrl(e.image?.url ?? e.thumbnail?.url),
  };
  // Aperçu vide (lien sans métadonnées) : rien à afficher.
  return embed.title || embed.description || embed.imageUrl || embed.authorName ? [embed] : [];
}

const MENTION = /<(@!?|@&|#)(\d{17,20})>/g;

/** Noms des mentions présentes dans le contenu (et seulement elles). Une mention inconnue reste absente. */
export function resolveMentions(m: APIMessage, ctx: NormalizeContext): DiscordMentions {
  const mentions: DiscordMentions = { users: {}, roles: {}, channels: {} };
  const users = new Map(m.mentions.map((u) => [u.id, displayName(u)]));
  for (const [, kind, id] of m.content.matchAll(MENTION)) {
    if (kind === "@&") {
      const role = ctx.roles.get(id);
      if (role) mentions.roles[id] = { name: role.name, color: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : null };
    } else if (kind === "#") {
      const channel = ctx.channels.get(id);
      if (channel) mentions.channels[id] = channel;
    } else {
      const user = users.get(id);
      if (user) mentions.users[id] = user;
    }
  }
  return mentions;
}

/** Le contenu contient-il des mentions de rôles ou de salons (à résoudre avec la liste du serveur) ? */
export function needsGuildLookup(messages: readonly APIMessage[]): { roles: boolean; channels: boolean } {
  return {
    roles: messages.some((m) => m.content.includes("<@&")),
    channels: messages.some((m) => m.content.includes("<#")),
  };
}
