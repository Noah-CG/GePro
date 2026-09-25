/**
 * Client REST Discord (API v10), en appels directs, sans SDK ni Gateway : sur Vercel (serverless),
 * aucune connexion WebSocket ne peut rester ouverte. Les lectures sont interrogées à intervalle
 * régulier par le navigateur, via les routes API de GePro.
 *
 * - Lectures : cache de données Next.js de quelques secondes (`next.revalidate`), partagé entre
 *   utilisateurs. Dix personnes qui ont le panneau ouvert = un appel à Discord toutes les 3 s.
 * - 429 : on attend `retry_after` s'il est court, sinon on renvoie l'erreur avec ce délai.
 * - Toute réponse d'erreur est traduite en DiscordError.
 */
import "server-only";
import { hasEncryptionKey } from "@/lib/crypto";
import { DiscordError } from "./errors";
import type { APIChannel, APIErrorBody, APIGuild, APIMessage, APIRole, APIWebhook } from "./types";

const API_URL = "https://discord.com/api/v10";
/** Discord exige un User-Agent de la forme « DiscordBot (url, version) ». */
const USER_AGENT = "DiscordBot (https://github.com/Noah-CG/GePro, 1.0)";
const TIMEOUT_MS = 10_000;
/** Au-delà, on n'attend pas : l'erreur remonte au navigateur, qui réessaiera plus tard. */
const MAX_INLINE_WAIT_MS = 2_000;

/** Durée de cache des lectures fréquentes (salon, messages), en secondes. */
export const LIVE_CACHE_SECONDS = 3;
/** Durée de cache des listes de rôles et de salons du serveur (résolution des mentions). */
const GUILD_CACHE_SECONDS = 300;

// trim() : une variable collée dans Vercel peut garder un retour à la ligne final.
export const getBotToken = () => process.env.DISCORD_BOT_TOKEN?.trim() || null;

/** Jeton du bot et clé de chiffrement (pour le jeton du webhook) : sans eux, l'intégration est désactivée. */
export const isDiscordConfigured = () => getBotToken() !== null && hasEncryptionKey();

type RequestOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Secondes de cache (GET uniquement). Absent : pas de cache. */
  revalidate?: number;
  /** Faux pour l'exécution d'un webhook, authentifiée par son jeton dans l'URL. */
  bot?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}, attempt = 0): Promise<T> {
  const { method = "GET", query, body, revalidate, bot = true } = options;
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (bot) {
    const token = getBotToken();
    if (!token) throw new DiscordError("not_configured");
    headers.Authorization = `Bot ${token}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const params = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => e[1] !== undefined));
  const url = `${API_URL}${path}${params.size ? `?${params}` : ""}`;
  const cache: RequestInit =
    method === "GET" && revalidate ? { next: { revalidate } } : { cache: "no-store" };

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...cache,
    });
  } catch (e) {
    throw new DiscordError("network", e instanceof Error ? e.message : String(e));
  }

  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

  const error = (await readJson(res)) as APIErrorBody | null;
  // Le jeton d'un webhook fait partie de son adresse : il ne doit pas finir dans les journaux.
  const label = `${method} ${bot ? path : path.replace(/[^/]+$/, "***")}`;
  if (res.status === 429) {
    const waitMs = retryAfterMs(res, error);
    if (attempt === 0 && waitMs <= MAX_INLINE_WAIT_MS) {
      await sleep(waitMs);
      return request<T>(path, options, attempt + 1);
    }
    throw new DiscordError("rate_limited", label, Math.ceil(waitMs / 1000));
  }
  if (res.status >= 500 && attempt === 0) {
    await sleep(500);
    return request<T>(path, options, attempt + 1);
  }
  throw toDiscordError(res.status, error, label);
}

/** Délai demandé par Discord : `retry_after` (secondes, décimal) du corps, sinon l'en-tête. */
function retryAfterMs(res: Response, body: APIErrorBody | null): number {
  const seconds = typeof body?.retry_after === "number" ? body.retry_after : Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 1000;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Codes d'erreur JSON de Discord :
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-json-error-codes
 */
export function toDiscordError(status: number, body: APIErrorBody | null, context = ""): DiscordError {
  const detail = `HTTP ${status} ${body?.code ?? ""} ${body?.message ?? ""} ${context}`.trim();
  switch (body?.code) {
    case 10003: // Unknown Channel
      return new DiscordError("channel_not_found", detail);
    case 10004: // Unknown Guild
      return new DiscordError("bot_not_in_guild", detail);
    case 10015: // Unknown Webhook
    case 50027: // Invalid Webhook Token
      return new DiscordError("webhook_missing", detail);
    case 30007: // Maximum number of webhooks reached
    case 30058: // Maximum number of webhooks per guild reached
      return new DiscordError("too_many_webhooks", detail);
    case 50001: // Missing Access
      return new DiscordError("missing_access", detail);
    case 50013: // Missing Permissions
      return new DiscordError("missing_permissions", detail);
    case 50035: // Invalid Form Body (contenu ou pseudo refusé)
      return new DiscordError("rejected", detail);
  }
  if (status === 401) return new DiscordError("invalid_token", detail);
  if (status === 403) return new DiscordError("missing_access", detail);
  if (status === 404) return new DiscordError("channel_not_found", detail);
  if (status >= 500) return new DiscordError("unavailable", detail);
  return new DiscordError("unknown", detail);
}

// Points d'entrée

/** Salon, avec l'id de son dernier message. `fresh` : sans cache (vérification au rattachement). */
export const getChannel = (channelId: string, { fresh = false } = {}) =>
  request<APIChannel>(`/channels/${channelId}`, { revalidate: fresh ? undefined : LIVE_CACHE_SECONDS });

/** Serveur : sert à savoir si le bot en est membre (403/404 sinon). */
export const getGuild = (guildId: string) => request<APIGuild>(`/guilds/${guildId}`);

/**
 * Messages d'un salon (100 au plus), du plus récent au plus ancien. `before` / `after` sont
 * exclusifs ; sans eux, les derniers messages.
 */
export const getMessages = (channelId: string, params: { before?: string; after?: string; limit: number }) =>
  request<APIMessage[]>(`/channels/${channelId}/messages`, {
    query: { before: params.before, after: params.after, limit: String(params.limit) },
    revalidate: LIVE_CACHE_SECONDS,
  });

export const getGuildRoles = (guildId: string) => request<APIRole[]>(`/guilds/${guildId}/roles`, { revalidate: GUILD_CACHE_SECONDS });

export const getGuildChannels = (guildId: string) =>
  request<APIChannel[]>(`/guilds/${guildId}/channels`, { revalidate: GUILD_CACHE_SECONDS });

/** Webhooks du salon (permission « Gérer les webhooks »). */
export const getChannelWebhooks = (channelId: string) => request<APIWebhook[]>(`/channels/${channelId}/webhooks`);

export const createWebhook = (channelId: string, name: string) =>
  request<APIWebhook>(`/channels/${channelId}/webhooks`, { method: "POST", body: { name } });

export type WebhookPayload = {
  content: string;
  username: string;
  avatar_url?: string;
  /** `{ parse: [] }` : aucune mention (@everyone, @here, rôles, membres) ne notifie personne. */
  allowed_mentions: { parse: never[] };
};

/** Publie via le webhook ; `wait=true` : Discord renvoie le message créé. */
export const executeWebhook = (webhookId: string, token: string, payload: WebhookPayload) =>
  request<APIMessage>(`/webhooks/${webhookId}/${encodeURIComponent(token)}`, {
    method: "POST",
    query: { wait: "true" },
    body: payload,
    bot: false,
  });
