import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectDiscord } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { DISCORD_ERROR_MESSAGES as MSG } from "@/lib/discord/errors";
import { linkCode } from "@/lib/discord/service";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { apiMessage, CHANNEL_ID, discordError, GUILD_ID, mockDiscord } from "@/test/discord";
import { json } from "@/test/google";
import { linkDiscordChannel, prepareDiscordLink, unlinkDiscordChannel } from "./discord";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let projectId: string;
let meId: string;

/** Le code de vérification a été publié dans le salon. */
const codePosted = () => ({ messages: () => json([apiMessage({ content: linkCode(projectId, CHANNEL_ID, meId) })]) });

beforeEach(async () => {
  await resetDb(db);
  const me = await insertUser(db);
  meId = me.id;
  projectId = (await insertProject(db, "Refonte du site", me.id)).id;
  vi.mocked(requireUser).mockResolvedValue({ ...me, role: "member" });
});

describe("rattachement depuis les paramètres", () => {
  it("donne d'abord le code à publier dans le salon, et refuse de relier sans lui", async () => {
    mockDiscord();
    expect(await prepareDiscordLink(projectId, CHANNEL_ID)).toEqual({
      ok: true,
      data: { channelName: "général", code: linkCode(projectId, CHANNEL_ID, meId) },
    });
    expect(await linkDiscordChannel(projectId, CHANNEL_ID)).toEqual({ ok: false, error: MSG.link_code_missing });
    expect(await db.select().from(projectDiscord)).toHaveLength(0);
  });

  it("accepte le lien du salon", async () => {
    mockDiscord(codePosted());
    const res = await linkDiscordChannel(projectId, `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}`);
    expect(res).toEqual({ ok: true, data: { guildId: GUILD_ID, channelId: CHANNEL_ID, channelName: "général" } });
    expect(await db.select().from(projectDiscord)).toHaveLength(1);
  });

  it("refuse une saisie qui n'est pas un salon", async () => {
    expect(await linkDiscordChannel(projectId, "#général")).toEqual({ ok: false, error: MSG.invalid_channel });
  });

  it("explique pourquoi le bot n'a pas accès", async () => {
    mockDiscord({ channel: () => discordError(403, 50001) });
    expect(await linkDiscordChannel(projectId, CHANNEL_ID)).toEqual({ ok: false, error: MSG.missing_access });
  });

  it("délie le salon", async () => {
    mockDiscord(codePosted());
    await linkDiscordChannel(projectId, CHANNEL_ID);
    expect(await unlinkDiscordChannel(projectId)).toEqual({ ok: true, data: undefined });
    expect(await db.select().from(projectDiscord)).toHaveLength(0);
  });
});
