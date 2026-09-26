import { describe, expect, it } from "vitest";
import { isReservedUsername, suggestUsername, usernameFormatError } from "./usernames";

const none = () => false;

describe("format du nom d'utilisateur", () => {
  it("3 à 30 caractères : lettres, chiffres, _ et -", () => {
    expect(usernameFormatError("camille_M-2")).toBeNull();
    expect(usernameFormatError("ab")).toBe("3 caractères minimum");
    expect(usernameFormatError("a".repeat(31))).toBe("30 caractères maximum");
    expect(usernameFormatError("camille martin")).toBe("Lettres, chiffres, _ et - uniquement");
    expect(usernameFormatError("émilie")).toBe("Lettres, chiffres, _ et - uniquement");
    expect(usernameFormatError("a@b")).toBe("Lettres, chiffres, _ et - uniquement");
  });

  it("refuse les noms réservés, quelle que soit la casse", () => {
    for (const name of ["admin", "API", "www", "Support", "gepro"]) {
      expect(isReservedUsername(name)).toBe(true);
      expect(usernameFormatError(name)).toBe("Ce nom d'utilisateur est réservé");
    }
    expect(isReservedUsername("administration")).toBe(false);
  });
});

describe("suggestUsername", () => {
  it("part du nom, sans accents ni espaces", async () => {
    expect(await suggestUsername("Camille Martin", "c@exemple.fr", none)).toBe("camille-martin");
    expect(await suggestUsername("Émilie Lœuvre", "e@exemple.fr", none)).toBe("emilie-loeuvre");
    expect(await suggestUsername("  Jean--Luc  ", "j@exemple.fr", none)).toBe("jean-luc");
  });

  it("à défaut, part de l'email ; sinon « membre »", async () => {
    expect(await suggestUsername("Jo", "jo.smith@exemple.fr", none)).toBe("jo-smith");
    expect(await suggestUsername("!!", "x@exemple.fr", none)).toBe("membre");
  });

  it("ajoute un suffixe en cas de collision ou de nom réservé, sans dépasser 30 caractères", async () => {
    const taken = new Set(["camille-martin", "camille-martin-2"]);
    expect(await suggestUsername("Camille Martin", "c@exemple.fr", (c) => taken.has(c))).toBe("camille-martin-3");
    expect(await suggestUsername("Admin", "a@exemple.fr", none)).toBe("admin-2");
    const long = "Marie-Charlotte de La Rochefoucauld";
    const first = await suggestUsername(long, "m@exemple.fr", none);
    expect(first).toBe("marie-charlotte-de-la-rochefou");
    const second = await suggestUsername(long, "m@exemple.fr", (c) => c === first);
    expect(second).toBe("marie-charlotte-de-la-rochef-2");
    expect(second.length).toBeLessThanOrEqual(30);
  });

  it("le résultat est toujours un nom valide", async () => {
    for (const name of ["Ça", "Zoë D'Arc", "李小龍", "a b c d e f g h i j k l m n o p q r s t"]) {
      const username = await suggestUsername(name, "prenom.nom@exemple.fr", none);
      expect(usernameFormatError(username)).toBeNull();
    }
  });
});
