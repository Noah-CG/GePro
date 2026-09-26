import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { linkChannel } from "@/lib/discord/service";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { CHANNEL_ID, discordError, LAST_MESSAGE_ID, mockDiscord } from "@/test/discord";
import { json } from "@/test/google";
import { GET as getMessages, POST as postMessage } from "./messages/route";
import { POST as postRead } from "./read/route";
import { GET as getStatus } from "./status/route";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

let me: Awaited<ReturnType<typeof insertUser>>;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  me = await insertUser(db, "Camille Martin");
  projectId = (await insertProject(db, "Refonte du site", me.id)).id;
  vi.mocked(getCurrentUser).mockResolvedValue({ ...me, role: "member" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ctx = (id = projectId) => ({ params: Promise.resolve({ id }) });
const url = (path: string) => `http://localhost/api/projects/${projectId}/discord/${path}`;
const post = (path: string, body: unknown) =>
  new NextRequest(url(path), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

async function link() {
  mockDiscord();
  await linkChannel(projectId, CHANNEL_ID, me.id);
}

describe("routes Discord d'un projet", () => {
  it("exigent une session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await getStatus(new Request(url("status")), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("projet inconnu ou sans salon", async () => {
    expect((await getStatus(new Request(url("status")), ctx("pas-un-uuid"))).status).toBe(404);
    const res = await getStatus(new Request(url("status")), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_linked" });
  });

  it("status : non lu, puis lu après POST read", async () => {
    await link();
    expect(await (await getStatus(new Request(url("status")), ctx())).json()).toEqual({ lastMessageId: LAST_MESSAGE_ID, unread: true });

    const read = await postRead(post("read", { messageId: LAST_MESSAGE_ID }), ctx());
    expect(read.status).toBe(200);
    expect(await (await getStatus(new Request(url("status")), ctx())).json()).toEqual({ lastMessageId: LAST_MESSAGE_ID, unread: false });
  });

  it("messages : paramètres validés, réponse normalisée", async () => {
    await link();
    expect((await getMessages(new NextRequest(url("messages?before=1&after=2")), ctx())).status).toBe(400);

    const calls = mockDiscord();
    const res = await getMessages(new NextRequest(url(`messages?after=${LAST_MESSAGE_ID}&limit=50`)), ctx());
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.hasMore).toBe(false);
    expect(body.messages[0]).toMatchObject({ id: LAST_MESSAGE_ID, content: "Bonjour", author: { name: "Léa" } });
    expect(body.messages[0]).not.toHaveProperty("channel_id");
    expect(calls[0].url.searchParams.get("after")).toBe(LAST_MESSAGE_ID);
  });

  it("envoi : contenu validé (1 à 2 000 caractères)", async () => {
    await link();
    expect((await postMessage(post("messages", { content: "   " }), ctx())).status).toBe(400);
    expect((await postMessage(post("messages", { content: "x".repeat(2001) }), ctx())).status).toBe(400);

    const res = await postMessage(post("messages", { content: "Salut" }), ctx());
    expect(res.status).toBe(201);
    expect((await res.json()).message).toMatchObject({ content: "Salut", fromGePro: true });
  });

  it("transmet la limite de débit avec Retry-After", async () => {
    await link();
    mockDiscord({ channel: () => json({ message: "rate", retry_after: 30 }, 429) });
    const res = await getStatus(new Request(url("status")), ctx());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toMatchObject({ error: "rate_limited", retryAfter: 30 });
  });

  it("explique un bot retiré du serveur", async () => {
    await link();
    mockDiscord({ channel: () => discordError(403, 50001), guild: () => discordError(403, 50001) });
    const res = await getStatus(new Request(url("status")), ctx());
    expect(await res.json()).toMatchObject({ error: "bot_not_in_guild" });
  });
});
