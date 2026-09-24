import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "./crypto";

const testKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;

afterEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = testKey;
});

describe("chiffrement des secrets", () => {
  it("déchiffre ce qu'il a chiffré", () => {
    expect(decryptSecret(encryptSecret("ya29.jeton-d'accès"))).toBe("ya29.jeton-d'accès");
  });

  it("ne laisse jamais le secret en clair et change de vecteur d'initialisation à chaque fois", () => {
    const a = encryptSecret("ya29.secret");
    const b = encryptSecret("ya29.secret");
    expect(a).toMatch(/^v1:/);
    expect(a).not.toContain("ya29");
    expect(a).not.toBe(b);
  });

  it("détecte une valeur altérée", () => {
    const [version, iv, tag, data] = encryptSecret("secret").split(":");
    const altered = Buffer.from(data, "base64url");
    altered[0] ^= 1;
    expect(() => decryptSecret([version, iv, tag, altered.toString("base64url")].join(":"))).toThrow();
  });

  it("refuse une valeur chiffrée avec une autre clé", () => {
    const encrypted = encryptSecret("secret");
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it("rejette un format inconnu", () => {
    expect(() => decryptSecret("pas-un-secret-chiffré")).toThrow("illisible");
  });

  it("exige une clé de 32 octets", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "";
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptSecret("x")).toThrow("manquant");

    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptSecret("x")).toThrow("32 octets");
  });

  it("ignore les espaces et retours à la ligne autour de la clé", () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = `  ${testKey}\n`;
    expect(hasEncryptionKey()).toBe(true);
    expect(decryptSecret(encryptSecret("x"))).toBe("x");
  });
});
