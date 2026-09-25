import { describe, expect, it } from "vitest";
import { apiMessage, WEBHOOK_ID } from "@/test/discord";
import { normalizeMessage, normalizeMessages, type NormalizeContext } from "./normalize";

const ROLE = "500000000000000005";
const CHAN = "600000000000000006";
const USER = "700000000000000007";

const ctx: NormalizeContext = {
  webhookId: WEBHOOK_ID,
  roles: new Map([[ROLE, { name: "Devs", color: 0x5865f2 }]]),
  channels: new Map([[CHAN, "annonces"]]),
};

describe("normalisation des messages", () => {
  it("ne garde que les champs utiles", () => {
    const message = normalizeMessage(apiMessage({ content: "Salut" }), ctx);
    expect(message).toEqual({
      id: "1234567890123456790",
      content: "Salut",
      author: { id: "400000000000000004", name: "Léa", avatarUrl: expect.stringMatching(/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d\.png$/), isBot: false },
      fromGePro: false,
      timestamp: "2026-09-25T08:00:00.000+00:00",
      editedTimestamp: null,
      attachments: [],
      embeds: [],
      mentions: { users: {}, roles: {}, channels: {} },
    });
  });

  it("reconnaît les messages publiés par le webhook du projet", () => {
    expect(normalizeMessage(apiMessage({ webhook_id: WEBHOOK_ID }), ctx).fromGePro).toBe(true);
    expect(normalizeMessage(apiMessage({ webhook_id: "999999999999999999" }), ctx).fromGePro).toBe(false);
  });

  it("résout les mentions présentes dans le contenu", () => {
    const m = apiMessage({
      content: `<@${USER}> <@&${ROLE}> <#${CHAN}> <#800000000000000008>`,
      mentions: [{ id: USER, username: "tom", global_name: null }],
    });
    expect(normalizeMessage(m, ctx).mentions).toEqual({
      users: { [USER]: "tom" },
      roles: { [ROLE]: { name: "Devs", color: "#5865f2" } },
      channels: { [CHAN]: "annonces" },
    });
  });

  it("pièces jointes : images repérées, liens non http écartés", () => {
    const m = apiMessage({
      attachments: [
        { id: "1", filename: "photo.png", size: 10, url: "https://cdn.discordapp.com/a/photo.png", content_type: "image/png", width: 800, height: 600 },
        { id: "2", filename: "notes.pdf", size: 20, url: "https://cdn.discordapp.com/a/notes.pdf", content_type: "application/pdf" },
        { id: "3", filename: "x.svg", size: 5, url: "javascript:alert(1)" },
      ],
    });
    expect(normalizeMessage(m, ctx).attachments).toEqual([
      { id: "1", filename: "photo.png", url: "https://cdn.discordapp.com/a/photo.png", size: 10, isImage: true, width: 800, height: 600 },
      { id: "2", filename: "notes.pdf", url: "https://cdn.discordapp.com/a/notes.pdf", size: 20, isImage: false, width: null, height: null },
    ]);
  });

  it("embeds : couleur en hexadécimal, embeds vides ignorés", () => {
    const m = apiMessage({ embeds: [{ title: "Déploiement", description: "OK", color: 0xff0000, url: "https://exemple.fr" }, { type: "link" }] });
    expect(normalizeMessage(m, ctx).embeds).toEqual([
      { title: "Déploiement", url: "https://exemple.fr/", description: "OK", color: "#ff0000", authorName: null, footer: null, imageUrl: null },
    ]);
  });

  it("trie du plus ancien au plus récent et écarte les messages système", () => {
    const list = normalizeMessages(
      [apiMessage({ id: "1234567890123456791" }), apiMessage({ id: "1234567890123456790" }), apiMessage({ id: "1234567890123456792", type: 7 })],
      ctx,
    );
    expect(list.map((m) => m.id)).toEqual(["1234567890123456790", "1234567890123456791"]);
  });
});
