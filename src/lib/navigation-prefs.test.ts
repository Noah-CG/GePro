import { describe, expect, it } from "vitest";
import { parseCollapsedSections, serializeCollapsedSections } from "./navigation-prefs";

describe("sections repliées de la barre latérale", () => {
  it("lit la liste mémorisée", () => {
    expect(parseCollapsedSections("documents.administration")).toEqual(["documents", "administration"]);
  });

  it("ignore l'absence de cookie, les doublons et les valeurs inconnues", () => {
    expect(parseCollapsedSections(undefined)).toEqual([]);
    expect(parseCollapsedSections("")).toEqual([]);
    expect(parseCollapsedSections("documents.documents.<script>.projet.administration")).toEqual(["documents", "administration"]);
  });

  it("sérialise sans doublon, et supprime le cookie quand plus rien n'est replié", () => {
    expect(serializeCollapsedSections(["administration", "documents", "administration"])).toBe("administration.documents");
    expect(serializeCollapsedSections([])).toBeNull();
  });

  it("aller-retour", () => {
    expect(parseCollapsedSections(serializeCollapsedSections(["administration", "documents"]) ?? undefined)).toEqual([
      "administration",
      "documents",
    ]);
  });
});
