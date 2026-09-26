import { describe, expect, it } from "vitest";
import { parseCollapsedSections, serializeCollapsedSections } from "./navigation-prefs";

describe("sections repliées de la barre latérale", () => {
  it("lit la liste mémorisée", () => {
    expect(parseCollapsedSections("documents.liens")).toEqual(["documents", "liens"]);
  });

  it("ignore l'absence de cookie, les doublons et les valeurs inconnues", () => {
    expect(parseCollapsedSections(undefined)).toEqual([]);
    expect(parseCollapsedSections("")).toEqual([]);
    // « administration » : ancienne section (gestion des membres, déplacée dans les paramètres).
    expect(parseCollapsedSections("documents.documents.<script>.projet.administration.liens")).toEqual(["documents", "liens"]);
  });

  it("sérialise sans doublon, et supprime le cookie quand plus rien n'est replié", () => {
    expect(serializeCollapsedSections(["liens", "documents", "liens"])).toBe("liens.documents");
    expect(serializeCollapsedSections([])).toBeNull();
  });

  it("aller-retour", () => {
    expect(parseCollapsedSections(serializeCollapsedSections(["liens", "documents"]) ?? undefined)).toEqual(["liens", "documents"]);
  });
});
