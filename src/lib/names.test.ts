import { describe, expect, it } from "vitest";
import { fullName, splitName } from "./names";

describe("splitName", () => {
  it("prénom = premier mot, nom = le reste", () => {
    expect(splitName("Camille Martin")).toEqual({ firstName: "Camille", lastName: "Martin" });
    expect(splitName("Marie-Charlotte de La Rochefoucauld")).toEqual({ firstName: "Marie-Charlotte", lastName: "de La Rochefoucauld" });
  });

  it("un seul mot : prénom seul, nom vide", () => {
    expect(splitName("Jo")).toEqual({ firstName: "Jo", lastName: "" });
  });

  it("fullName redonne le nom d'origine (même calcul que users.name)", () => {
    for (const name of ["Camille Martin", "Jo", "Émilie Lœuvre-Ça", "Anne de Bretagne"]) {
      const { firstName, lastName } = splitName(name);
      expect(fullName(firstName, lastName)).toBe(name);
    }
  });
});
