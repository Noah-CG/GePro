/**
 * Types minimaux de l'API REST Discord v10 : uniquement les champs lus par GePro.
 * Réponses brutes, jamais transmises au navigateur (voir model.ts pour le format normalisé).
 */

/** Identifiant Discord : entier 64 bits transmis en texte (voir snowflake.ts). */
export type Snowflake = string;

export type APIUser = {
  id: Snowflake;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  /** "0" pour les comptes passés aux pseudos uniques. */
  discriminator?: string;
  bot?: boolean;
};

/** Types de salons : https://discord.com/developers/docs/resources/channel#channel-object-channel-types */
export const CHANNEL_TYPES = { GUILD_TEXT: 0, GUILD_ANNOUNCEMENT: 5 } as const;

export type APIChannel = {
  id: Snowflake;
  type: number;
  guild_id?: Snowflake;
  name?: string | null;
  /** Dernier message du salon (il peut avoir été supprimé depuis). */
  last_message_id?: Snowflake | null;
};

export type APIGuild = { id: Snowflake; name: string };

export type APIRole = { id: Snowflake; name: string; color: number };

export type APIAttachment = {
  id: Snowflake;
  filename: string;
  size: number;
  url: string;
  proxy_url?: string;
  content_type?: string;
  width?: number | null;
  height?: number | null;
};

type APIEmbedMedia = { url: string; proxy_url?: string; width?: number; height?: number };

export type APIEmbed = {
  type?: string;
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name: string; url?: string };
  footer?: { text: string };
  image?: APIEmbedMedia;
  thumbnail?: APIEmbedMedia;
  fields?: { name: string; value: string; inline?: boolean }[];
};

/** Types de messages : https://discord.com/developers/docs/resources/message#message-object-message-types */
export const MESSAGE_TYPES = { DEFAULT: 0, REPLY: 19, CHAT_INPUT_COMMAND: 20, CONTEXT_MENU_COMMAND: 23 } as const;

export type APIMessage = {
  id: Snowflake;
  channel_id: Snowflake;
  type: number;
  content: string;
  author: APIUser;
  timestamp: string;
  edited_timestamp: string | null;
  attachments: APIAttachment[];
  embeds: APIEmbed[];
  /** Utilisateurs mentionnés, avec leur profil : suffit à résoudre `<@id>`. */
  mentions: APIUser[];
  mention_roles: Snowflake[];
  /** Présent si le message a été publié par un webhook. */
  webhook_id?: Snowflake;
};

/** Type 1 : webhook « entrant », le seul qui permet de publier. */
export const WEBHOOK_TYPE_INCOMING = 1;

export type APIWebhook = {
  id: Snowflake;
  type: number;
  name: string | null;
  channel_id: Snowflake | null;
  /** Fourni pour les webhooks entrants quand le bot a la permission « Gérer les webhooks ». */
  token?: string;
};

/** Corps JSON d'une réponse d'erreur. */
export type APIErrorBody = { code?: number; message?: string; retry_after?: number; global?: boolean };
