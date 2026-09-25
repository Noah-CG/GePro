import { describe, expect, it, vi } from "vitest";
import { json } from "@/test/google";
import { CHANNEL_ID, discordError, mockDiscord, WEBHOOK_ID, WEBHOOK_TOKEN } from "@/test/discord";
import { executeWebhook, getChannel, getMessages } from "./client";
import { DiscordError } from "./errors";

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (e: DiscordError) => e.code,
  );

describe("client REST Discord", () => {
  it("s'authentifie avec le jeton du bot et un User-Agent Discord", async () => {
    const calls = mockDiscord();
    await getChannel(CHANNEL_ID);
    expect(calls[0].url.toString()).toBe(`https://discord.com/api/v10/channels/${CHANNEL_ID}`);
    expect(calls[0].headers.get("authorization")).toBe("Bot test-bot-token");
    expect(calls[0].headers.get("user-agent")).toMatch(/^DiscordBot \(/);
  });

  it("transmet before / after / limit", async () => {
    const calls = mockDiscord();
    await getMessages(CHANNEL_ID, { after: "1234567890123456789", limit: 50 });
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ after: "1234567890123456789", limit: "50" });
  });

  it("exécute le webhook sans le jeton du bot, avec wait=true", async () => {
    const calls = mockDiscord();
    await executeWebhook(WEBHOOK_ID, WEBHOOK_TOKEN, { content: "Salut", username: "Camille", allowed_mentions: { parse: [] } });
    expect(calls[0].path).toBe(`/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`);
    expect(calls[0].url.searchParams.get("wait")).toBe("true");
    expect(calls[0].headers.get("authorization")).toBeNull();
    expect(calls[0].json).toEqual({ content: "Salut", username: "Camille", allowed_mentions: { parse: [] } });
  });

  it("sur 429, attend retry_after quand il est court puis réessaie", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    mockDiscord({ channel: () => (++attempts === 1 ? json({ message: "rate", retry_after: 0.5, global: false }, 429) : json({ id: CHANNEL_ID, type: 0 })) });
    const promise = getChannel(CHANNEL_ID);
    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toMatchObject({ id: CHANNEL_ID });
    expect(attempts).toBe(2);
    vi.useRealTimers();
  });

  it("sur 429 long, renvoie rate_limited avec le délai", async () => {
    mockDiscord({ channel: () => json({ message: "rate", retry_after: 12.3 }, 429) });
    const error = await getChannel(CHANNEL_ID).catch((e: DiscordError) => e);
    expect(error).toBeInstanceOf(DiscordError);
    expect((error as DiscordError).code).toBe("rate_limited");
    expect((error as DiscordError).retryAfter).toBe(13);
  });

  it("traduit les erreurs Discord en codes explicites", async () => {
    const cases: [Response, string][] = [
      [discordError(404, 10003), "channel_not_found"],
      [discordError(403, 50001), "missing_access"],
      [discordError(403, 50013), "missing_permissions"],
      [discordError(404, 10015), "webhook_missing"],
      [discordError(401, 0), "invalid_token"],
      [discordError(400, 30007), "too_many_webhooks"],
    ];
    for (const [response, code] of cases) {
      mockDiscord({ channel: () => response });
      expect(await codeOf(getChannel(CHANNEL_ID))).toBe(code);
    }
  });

  it("ne met pas le jeton du webhook dans le détail de l'erreur", async () => {
    mockDiscord({ execute: () => discordError(404, 10015) });
    const error = await executeWebhook(WEBHOOK_ID, WEBHOOK_TOKEN, { content: "x", username: "y", allowed_mentions: { parse: [] } }).catch(
      (e: Error) => e,
    );
    expect((error as Error).message).not.toContain(WEBHOOK_TOKEN);
  });

  it("erreur réseau", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await codeOf(getChannel(CHANNEL_ID))).toBe("network");
  });
});
