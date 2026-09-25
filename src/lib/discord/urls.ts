/** Adresses Discord (liens, CDN) : utilisables côté serveur comme dans le navigateur. */
import { isSnowflake } from "./snowflake";

const CDN = "https://cdn.discordapp.com";

/** Lien « Ouvrir dans Discord » (application ou site). */
export const channelUrl = (guildId: string, channelId: string) => `https://discord.com/channels/${guildId}/${channelId}`;

/** Image d'un emoji personnalisé (`<:nom:id>`, `<a:nom:id>` s'il est animé). */
export const emojiUrl = (id: string, animated: boolean) => `${CDN}/emojis/${id}.${animated ? "gif" : "webp"}?size=48&quality=lossless`;

/** Avatar d'un utilisateur (ou d'un webhook), sinon l'avatar par défaut de Discord. */
export function avatarUrl(user: { id: string; avatar?: string | null; discriminator?: string }): string {
  if (user.avatar) return `${CDN}/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=64`;
  // Règle de Discord : ancien discriminant modulo 5, sinon (id >> 22) modulo 6.
  const legacy = Number(user.discriminator);
  const index = legacy > 0 ? legacy % 5 : isSnowflake(user.id) ? Number((BigInt(user.id) >> 22n) % 6n) : 0;
  return `${CDN}/embed/avatars/${index}.png`;
}

/** Lien http(s) sûr à afficher, sinon null (javascript:, data:…). */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Identifiant de salon saisi dans les paramètres : l'id copié depuis Discord (mode
 * développeur) ou le lien du salon (https://discord.com/channels/<serveur>/<salon>).
 */
export function parseChannelInput(input: string): string | null {
  const value = input.trim();
  const match = value.match(/^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/\d{17,20}\/(\d{17,20})\/?(?:\d{17,20}\/?)?$/);
  const id = match ? match[1] : value;
  return isSnowflake(id) ? id : null;
}

/** Guide de configuration (bot, permissions, invitation), affiché quand le bot n'a pas accès au salon. */
export const DISCORD_DOCS_URL = "https://github.com/Noah-CG/GePro/blob/main/docs/discord.md";
