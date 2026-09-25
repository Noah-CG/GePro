import { describe, expect, it } from "vitest";
import { compareSnowflakes, isNewer, isSnowflake, snowflakeTime, sortById } from "./snowflake";
import { parseChannelInput } from "./urls";

// Deux ids voisins au-delà de 2^53 : égaux une fois convertis en Number.
const A = "1234567890123456789";
const B = "1234567890123456790";

describe("snowflakes", () => {
  it("compare en BigInt, sans perte de précision", () => {
    expect(Number(A)).toBe(Number(B));
    expect(compareSnowflakes(A, B)).toBe(-1);
    expect(compareSnowflakes(B, A)).toBe(1);
    expect(compareSnowflakes(A, A)).toBe(0);
  });

  it("compare des ids de longueurs différentes numériquement, pas comme du texte", () => {
    expect(compareSnowflakes("99999999999999999", "100000000000000000")).toBe(-1);
  });

  it("isNewer : tout id est plus récent que rien", () => {
    expect(isNewer(B, A)).toBe(true);
    expect(isNewer(A, B)).toBe(false);
    expect(isNewer(A, A)).toBe(false);
    expect(isNewer(A, null)).toBe(true);
    expect(isNewer(null, A)).toBe(false);
  });

  it("valide le format", () => {
    expect(isSnowflake(A)).toBe(true);
    expect(isSnowflake("123")).toBe(false);
    expect(isSnowflake("12345678901234567a")).toBe(false);
    expect(isSnowflake("99999999999999999999")).toBe(false); // > 2^64
    expect(isSnowflake(123456789012345678)).toBe(false);
  });

  it("extrait la date de création", () => {
    // Exemple de la documentation Discord.
    expect(new Date(snowflakeTime("175928847299117063")).toISOString()).toBe("2016-04-30T11:18:25.796Z");
  });

  it("trie du plus ancien au plus récent", () => {
    expect(sortById([{ id: B }, { id: A }]).map((m) => m.id)).toEqual([A, B]);
  });
});

describe("parseChannelInput", () => {
  it("accepte un id ou un lien de salon", () => {
    expect(parseChannelInput(` ${A} `)).toBe(A);
    expect(parseChannelInput(`https://discord.com/channels/${B}/${A}`)).toBe(A);
    expect(parseChannelInput(`https://canary.discord.com/channels/${B}/${A}/`)).toBe(A);
  });

  it("refuse le reste", () => {
    expect(parseChannelInput("général")).toBeNull();
    expect(parseChannelInput(`https://evil.com/channels/${B}/${A}`)).toBeNull();
  });
});
