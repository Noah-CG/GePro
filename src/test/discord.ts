/**
 * Faux Discord pour les tests : remplace fetch et répond aux points d'entrée de l'API REST v10
 * utilisés par GePro. Chaque route peut être remplacée pour simuler une erreur.
 */
import type { APIMessage, APIWebhook } from "@/lib/discord/types";
import { vi } from "vitest";
import { json } from "./google";

export const GUILD_ID = "100000000000000001";
export const CHANNEL_ID = "200000000000000002";
export const WEBHOOK_ID = "300000000000000003";
export const WEBHOOK_TOKEN = "jeton-du-webhook";
export const LAST_MESSAGE_ID = "1234567890123456790";

/** Erreur au format de l'API Discord. */
export const discordError = (status: number, code: number, message = "erreur") => json({ code, message }, status);

export function apiMessage(overrides: Partial<APIMessage> = {}): APIMessage {
  return {
    id: LAST_MESSAGE_ID,
    channel_id: CHANNEL_ID,
    type: 0,
    content: "Bonjour",
    author: { id: "400000000000000004", username: "lea", global_name: "Léa", avatar: null, discriminator: "0" },
    timestamp: "2026-09-25T08:00:00.000+00:00",
    edited_timestamp: null,
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
    ...overrides,
  };
}

export const geproWebhook = (overrides: Partial<APIWebhook> = {}): APIWebhook => ({
  id: WEBHOOK_ID,
  type: 1,
  name: "GePro",
  channel_id: CHANNEL_ID,
  token: WEBHOOK_TOKEN,
  ...overrides,
});

export type DiscordCall = { url: URL; method: string; path: string; headers: Headers; json: unknown };
type Route = (call: DiscordCall) => Response | Promise<Response>;

type Routes = {
  channel: Route;
  guild: Route;
  messages: Route;
  roles: Route;
  channels: Route;
  webhooks: Route;
  createWebhook: Route;
  execute: Route;
};

/** Discord simulé (remplace fetch) ; renvoie la liste des appels reçus, avec leur corps JSON. */
export function mockDiscord(overrides: Partial<Routes> = {}): DiscordCall[] {
  const routes: Routes = {
    channel: () => json({ id: CHANNEL_ID, type: 0, guild_id: GUILD_ID, name: "général", last_message_id: LAST_MESSAGE_ID }),
    guild: () => json({ id: GUILD_ID, name: "Équipe" }),
    messages: () => json([apiMessage()]),
    roles: () => json([]),
    channels: () => json([]),
    webhooks: () => json([]),
    createWebhook: () => json(geproWebhook()),
    execute: (call) =>
      json(apiMessage({ id: "1234567890123456800", content: (call.json as { content: string }).content, webhook_id: WEBHOOK_ID })),
    ...overrides,
  };

  const route = ({ path, method }: DiscordCall): Route => {
    if (/^\/webhooks\/\d+\/[^/]+$/.test(path)) return routes.execute;
    if (/^\/channels\/\d+\/messages$/.test(path)) return routes.messages;
    if (/^\/channels\/\d+\/webhooks$/.test(path)) return method === "POST" ? routes.createWebhook : routes.webhooks;
    if (/^\/channels\/\d+$/.test(path)) return routes.channel;
    if (/^\/guilds\/\d+\/roles$/.test(path)) return routes.roles;
    if (/^\/guilds\/\d+\/channels$/.test(path)) return routes.channels;
    if (/^\/guilds\/\d+$/.test(path)) return routes.guild;
    throw new Error(`Route Discord non simulée : ${method} ${path}`);
  };

  const calls: DiscordCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const call: DiscordCall = {
        url,
        method: init?.method ?? "GET",
        path: url.pathname.replace(/^\/api\/v10/, ""),
        headers: new Headers(init?.headers),
        json: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      };
      calls.push(call);
      return route(call)(call);
    }),
  );
  return calls;
}
