import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectDiscord } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { json } from "@/test/google";
import { insertProject, insertUser, resetDb } from "@/test/db";
import {
  apiMessage,
  CHANNEL_ID,
  discordError,
  geproWebhook,
  GUILD_ID,
  LAST_MESSAGE_ID,
  mockDiscord,
  WEBHOOK_ID,
  WEBHOOK_TOKEN,
} from "@/test/discord";
import { DiscordError } from "./errors";
import {
  diagnoseAccessError,
  getDiscordChannelViews,
  getLastRead,
  getProjectDiscord,
  getStatus,
  linkChannel,
  markRead,
  sendMessage,
  webhookUsername,
} from "./service";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

let userId: string;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  userId = (await insertUser(db)).id;
  projectId = (await insertProject(db, "Refonte du site", userId)).id;
});

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (e: DiscordError) => e.code,
  );

async function linked() {
  mockDiscord();
  await linkChannel(projectId, CHANNEL_ID, userId);
  return (await getProjectDiscord(projectId))!;
}

describe("rattachement d'un salon", () => {
  it("vérifie le salon, crée le webhook GePro et chiffre son jeton", async () => {
    const calls = mockDiscord();
    expect(await linkChannel(projectId, CHANNEL_ID, userId)).toEqual({ guildId: GUILD_ID, channelId: CHANNEL_ID, channelName: "général" });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /channels/${CHANNEL_ID}`,
      `GET /channels/${CHANNEL_ID}/webhooks`,
      `POST /channels/${CHANNEL_ID}/webhooks`,
    ]);
    expect(calls[2].json).toEqual({ name: "GePro" });

    const [row] = await db.select().from(projectDiscord);
    expect(row).toMatchObject({ projectId, guildId: GUILD_ID, channelId: CHANNEL_ID, webhookId: WEBHOOK_ID, linkedBy: userId });
    expect(row.webhookTokenEnc).not.toContain(WEBHOOK_TOKEN);
    expect(decryptSecret(row.webhookTokenEnc)).toBe(WEBHOOK_TOKEN);
  });

  it("réutilise le webhook GePro existant", async () => {
    const calls = mockDiscord({
      webhooks: () => json([geproWebhook({ id: "111111111111111111", name: "Autre" }), geproWebhook()]),
    });
    await linkChannel(projectId, CHANNEL_ID, userId);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect((await getProjectDiscord(projectId))!.webhookId).toBe(WEBHOOK_ID);
  });

  it("remplace le salon déjà relié", async () => {
    await linked();
    mockDiscord({ channel: () => json({ id: CHANNEL_ID, type: 0, guild_id: GUILD_ID, name: "projet-x" }) });
    await linkChannel(projectId, CHANNEL_ID, userId);
    const rows = await db.select().from(projectDiscord);
    expect(rows).toHaveLength(1);
    expect(rows[0].channelName).toBe("projet-x");
  });

  it("liste le salon de chaque projet, sans aucun secret", async () => {
    await linked();
    expect(await getDiscordChannelViews(userId)).toEqual({ [projectId]: { guildId: GUILD_ID, channelId: CHANNEL_ID, channelName: "général" } });
  });

  it("refuse un salon qui n'est pas textuel", async () => {
    mockDiscord({ channel: () => json({ id: CHANNEL_ID, type: 2, guild_id: GUILD_ID, name: "vocal" }) });
    expect(await codeOf(linkChannel(projectId, CHANNEL_ID, userId))).toBe("not_text_channel");
  });

  it("signale l'absence de permission « Gérer les webhooks »", async () => {
    mockDiscord({ webhooks: () => discordError(403, 50013) });
    expect(await codeOf(linkChannel(projectId, CHANNEL_ID, userId))).toBe("missing_permissions");
    expect(await getProjectDiscord(projectId)).toBeNull();
  });
});

describe("état de lecture", () => {
  it("n'avance jamais en arrière (comparaison sur 64 bits)", async () => {
    await markRead(userId, CHANNEL_ID, "1234567890123456790");
    await markRead(userId, CHANNEL_ID, "1234567890123456789");
    expect(await getLastRead(userId, CHANNEL_ID)).toBe("1234567890123456790");
    await markRead(userId, CHANNEL_ID, "1234567890123456791");
    expect(await getLastRead(userId, CHANNEL_ID)).toBe("1234567890123456791");
    // Id plus court mais plus récent… en texte, "99…" > "12…" ; en nombre, non.
    await markRead(userId, CHANNEL_ID, "99999999999999999");
    expect(await getLastRead(userId, CHANNEL_ID)).toBe("1234567890123456791");
  });

  it("non lu tant que le dernier message est plus récent que le dernier lu", async () => {
    const link = await linked();
    expect(await getStatus(link, userId)).toEqual({ lastMessageId: LAST_MESSAGE_ID, unread: true });
    await markRead(userId, CHANNEL_ID, LAST_MESSAGE_ID);
    expect(await getStatus(link, userId)).toEqual({ lastMessageId: LAST_MESSAGE_ID, unread: false });
  });

  it("met à jour le nom du salon renommé sur Discord", async () => {
    const link = await linked();
    mockDiscord({ channel: () => json({ id: CHANNEL_ID, type: 0, guild_id: GUILD_ID, name: "renommé", last_message_id: null }) });
    expect(await getStatus(link, userId)).toEqual({ lastMessageId: null, unread: false });
    expect((await getProjectDiscord(projectId))!.channelName).toBe("renommé");
  });
});

describe("envoi", () => {
  it("publie au nom du membre sans aucune mention, puis marque le message comme lu", async () => {
    const link = await linked();
    const calls = mockDiscord();
    const message = await sendMessage(link, { id: userId, name: "Camille Martin" }, "Salut @everyone");

    expect(calls[0].json).toEqual({ content: "Salut @everyone", username: "Camille Martin", allowed_mentions: { parse: [] } });
    expect(message).toMatchObject({ id: "1234567890123456800", content: "Salut @everyone", fromGePro: true });
    expect(await getLastRead(userId, CHANNEL_ID)).toBe("1234567890123456800");
  });

  it("recrée le webhook supprimé côté Discord et renvoie le message", async () => {
    const link = await linked();
    let executions = 0;
    const calls = mockDiscord({
      execute: (call) =>
        ++executions === 1
          ? discordError(404, 10015)
          : json(apiMessage({ id: "1234567890123456801", content: (call.json as { content: string }).content, webhook_id: "222222222222222222" })),
      createWebhook: () => json(geproWebhook({ id: "222222222222222222", token: "nouveau-jeton" })),
    });
    const message = await sendMessage(link, { id: userId, name: "Camille" }, "Re");
    expect(message.fromGePro).toBe(true);
    expect(calls.at(-1)!.path).toBe("/webhooks/222222222222222222/nouveau-jeton");
    const row = (await getProjectDiscord(projectId))!;
    expect(row.webhookId).toBe("222222222222222222");
    expect(decryptSecret(row.webhookTokenEnc)).toBe("nouveau-jeton");
  });

  it("nettoie le pseudo refusé par Discord", () => {
    expect(webhookUsername("Camille Martin")).toBe("Camille Martin");
    expect(webhookUsername("Discord Fan @ #1")).toBe("Fan 1");
    expect(webhookUsername("   ")).toBe("Membre GePro");
    expect(webhookUsername("x".repeat(100))).toHaveLength(80);
  });
});

describe("diagnostic d'accès", () => {
  it("distingue un bot retiré du serveur d'une permission manquante", async () => {
    const missing = new DiscordError("missing_access");
    mockDiscord({ guild: () => discordError(403, 50001) });
    expect(((await diagnoseAccessError(missing, GUILD_ID)) as DiscordError).code).toBe("bot_not_in_guild");
    mockDiscord();
    expect(((await diagnoseAccessError(missing, GUILD_ID)) as DiscordError).code).toBe("missing_access");
  });
});
