import { describe, expect, it } from "vitest";
import { isEmojiOnly, parseDiscordMarkdown as parse } from "./markdown";

const text = (t: string) => ({ type: "text", text: t });
const ID = "123456789012345678";

describe("markdown Discord", () => {
  it("laisse le texte simple intact, y compris le HTML", () => {
    expect(parse("Bonjour <b>à tous</b> & <script>")).toEqual([text("Bonjour <b>à tous</b> & <script>")]);
  });

  it("styles de base", () => {
    expect(parse("**gras** *ita* _ita_ __sous__ ~~barré~~ ||secret||")).toEqual([
      { type: "bold", children: [text("gras")] },
      text(" "),
      { type: "italic", children: [text("ita")] },
      text(" "),
      { type: "italic", children: [text("ita")] },
      text(" "),
      { type: "underline", children: [text("sous")] },
      text(" "),
      { type: "strike", children: [text("barré")] },
      text(" "),
      { type: "spoiler", children: [text("secret")] },
    ]);
  });

  it("imbrique les styles", () => {
    expect(parse("***les deux***")).toEqual([{ type: "bold", children: [{ type: "italic", children: [text("les deux")] }] }]);
    expect(parse("__*souligné italique*__")).toEqual([
      { type: "underline", children: [{ type: "italic", children: [text("souligné italique")] }] },
    ]);
  });

  it("ne met pas en italique le milieu d'un mot ni une étoile isolée", () => {
    expect(parse("snake_case_name")).toEqual([text("snake_case_name")]);
    expect(parse("2 * 3 = 6")).toEqual([text("2 * 3 = 6")]);
  });

  it("n'interprète rien dans le code", () => {
    expect(parse("`**pas gras**`")).toEqual([{ type: "code", text: "**pas gras**" }]);
    expect(parse("```ts\nconst a = **1**;\n```")).toEqual([{ type: "codeBlock", lang: "ts", text: "const a = **1**;" }]);
    expect(parse("```sans langue```")).toEqual([{ type: "codeBlock", lang: null, text: "sans langue" }]);
  });

  it("citations en début de ligne", () => {
    expect(parse("> citée\n> aussi\nnormale")).toEqual([
      { type: "quote", children: [text("citée"), { type: "br" }, text("aussi")] },
      text("normale"),
    ]);
    expect(parse(">>> tout\nle reste")).toEqual([{ type: "quote", children: [text("tout"), { type: "br" }, text("le reste")] }]);
    expect(parse("a > b")).toEqual([text("a > b")]);
  });

  it("liens nus, entre chevrons et masqués", () => {
    expect(parse("voir https://exemple.fr/page.")).toEqual([
      text("voir "),
      { type: "link", url: "https://exemple.fr/page", children: [text("https://exemple.fr/page")] },
      text("."),
    ]);
    expect(parse("<https://exemple.fr>")).toEqual([
      { type: "link", url: "https://exemple.fr", children: [text("https://exemple.fr")] },
    ]);
    expect(parse("[la **doc**](https://exemple.fr/doc)")).toEqual([
      { type: "link", url: "https://exemple.fr/doc", children: [text("la "), { type: "bold", children: [text("doc")] }] },
    ]);
  });

  it("refuse les liens masqués non http(s)", () => {
    expect(parse("[clic](javascript:alert(1))")).toEqual([text("[clic](javascript:alert(1))")]);
  });

  it("mentions, emojis et horodatages", () => {
    expect(parse(`<@${ID}> <@!${ID}> <@&${ID}> <#${ID}> @everyone`)).toEqual([
      { type: "userMention", id: ID },
      text(" "),
      { type: "userMention", id: ID },
      text(" "),
      { type: "roleMention", id: ID },
      text(" "),
      { type: "channelMention", id: ID },
      text(" "),
      { type: "massMention", target: "everyone" },
    ]);
    expect(parse(`<:parrot:${ID}><a:dance:${ID}>`)).toEqual([
      { type: "emoji", name: "parrot", id: ID, animated: false },
      { type: "emoji", name: "dance", id: ID, animated: true },
    ]);
    expect(parse("<t:1700000000:R>")).toEqual([{ type: "timestamp", seconds: 1_700_000_000, style: "R" }]);
  });

  it("échappement", () => {
    expect(parse("\\*pas italique\\*")).toEqual([text("*pas italique*")]);
  });

  it("retours à la ligne", () => {
    expect(parse("a\nb")).toEqual([text("a"), { type: "br" }, text("b")]);
  });

  it("résiste aux imbrications profondes", () => {
    const deep = "||".repeat(200) + "x" + "||".repeat(200);
    expect(() => parse(deep)).not.toThrow();
  });

  it("repère les messages composés uniquement d'emojis", () => {
    expect(isEmojiOnly(parse(`<:ok:${ID}> <:yo:${ID}>`))).toBe(true);
    expect(isEmojiOnly(parse(`salut <:ok:${ID}>`))).toBe(false);
    expect(isEmojiOnly(parse(""))).toBe(false);
  });
});
