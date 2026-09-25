import { describe, expect, it } from "vitest";
import { buildThread } from "./grouping";
import type { DiscordMessage } from "./model";

const TZ = "Europe/Paris";
const NOW = new Date("2026-09-25T10:00:00Z");

let seq = 0;
function msg(timestamp: string, author = "lea", overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: String(1234567890123456000n + BigInt(++seq)),
    content: "x",
    author: { id: author === "gepro" ? "300000000000000003" : `${author}-id`, name: author, avatarUrl: "", isBot: false },
    fromGePro: false,
    timestamp,
    editedTimestamp: null,
    attachments: [],
    embeds: [],
    mentions: { users: {}, roles: {}, channels: {} },
    ...overrides,
  };
}

const shape = (rows: ReturnType<typeof buildThread>) =>
  rows.map((r) => (r.kind === "day" ? `— ${r.label}` : `${r.message.author.name}${r.grouped ? " (groupé)" : ""}`));

describe("fil de messages", () => {
  it("regroupe le même auteur à moins de 5 minutes d'intervalle", () => {
    const rows = buildThread(
      [
        msg("2026-09-25T08:00:00Z"),
        msg("2026-09-25T08:04:59Z"),
        msg("2026-09-25T08:10:00Z"), // 5 min après le précédent : nouveau groupe
        msg("2026-09-25T08:10:30Z", "tom"),
        msg("2026-09-25T08:11:00Z"),
      ],
      NOW,
      TZ,
    );
    expect(shape(rows)).toEqual(["— Aujourd'hui", "lea", "lea (groupé)", "lea", "tom", "lea"]);
  });

  it("sépare les jours dans le fuseau du lecteur, sans regrouper par-dessus un séparateur", () => {
    const rows = buildThread(
      [
        msg("2026-09-22T12:00:00Z"),
        msg("2026-09-24T21:58:00Z"), // 23 h 58 à Paris, la veille
        msg("2026-09-24T22:01:00Z"), // 0 h 01 à Paris
      ],
      NOW,
      TZ,
    );
    expect(shape(rows)).toEqual(["— mardi 22 septembre 2026", "lea", "— Hier", "lea", "— Aujourd'hui", "lea"]);
  });

  it("distingue deux membres qui écrivent depuis GePro (même webhook, pseudos différents)", () => {
    const a = msg("2026-09-25T08:00:00Z", "gepro", { author: { id: "300000000000000003", name: "Camille", avatarUrl: "", isBot: true } });
    const b = msg("2026-09-25T08:01:00Z", "gepro", { author: { id: "300000000000000003", name: "Tom", avatarUrl: "", isBot: true } });
    expect(shape(buildThread([a, b], NOW, TZ))).toEqual(["— Aujourd'hui", "Camille", "Tom"]);
  });
});
