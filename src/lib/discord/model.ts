/**
 * Format des données Discord échangées entre les routes API et le navigateur. Construit côté
 * serveur par normalize.ts : le navigateur ne reçoit jamais la réponse brute de Discord.
 */
import type { DiscordErrorCode } from "./errors";

export type DiscordAuthor = {
  id: string;
  name: string;
  avatarUrl: string;
  isBot: boolean;
};

export type DiscordAttachment = {
  id: string;
  filename: string;
  url: string;
  size: number;
  /** Image affichable directement dans le fil (sinon : simple lien). */
  isImage: boolean;
  width: number | null;
  height: number | null;
};

export type DiscordEmbed = {
  title: string | null;
  url: string | null;
  description: string | null;
  /** Couleur de la barre latérale, "#rrggbb". */
  color: string | null;
  authorName: string | null;
  footer: string | null;
  imageUrl: string | null;
};

/** Noms des mentions présentes dans le contenu, résolus côté serveur. */
export type DiscordMentions = {
  users: Record<string, string>;
  roles: Record<string, { name: string; color: string | null }>;
  channels: Record<string, string>;
};

export type DiscordMessage = {
  id: string;
  content: string;
  author: DiscordAuthor;
  /** Publié depuis GePro (par le webhook du projet). */
  fromGePro: boolean;
  timestamp: string;
  editedTimestamp: string | null;
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  mentions: DiscordMentions;
};

/** GET /api/projects/[id]/discord/status */
export type DiscordStatus = { lastMessageId: string | null; unread: boolean };

/** GET /api/projects/[id]/discord/messages : messages du plus ancien au plus récent. */
export type DiscordMessagesPage = {
  messages: DiscordMessage[];
  /** Vrai si Discord a renvoyé une page pleine : d'autres messages suivent (ou précèdent). */
  hasMore: boolean;
};

/** Réponse d'erreur des routes API. */
export type DiscordApiError = {
  error: DiscordErrorCode;
  message: string;
  /** Secondes à attendre avant de réessayer (limite de débit). */
  retryAfter?: number;
};

/** Salon relié à un projet, tel qu'affiché dans l'interface. */
export type DiscordChannelView = {
  guildId: string;
  channelId: string;
  channelName: string;
};
