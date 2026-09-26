import { describe, expect, it } from "vitest";
import { parseCollapsedSections, serializeCollapsedSections } from "./navigation-prefs";

describe("sections repliées de la barre latérale", () => {
  it("lit la liste mémorisée", () => {
    expect(parseCollapsedSections("documents")).toEqual(["documents"]);
  });

  it("ignore l'absence de cookie, les doublons et les valeurs inconnues", () => {
    expect(parseCollapsedSections(undefined)).toEqual([]);
    expect(parseCollapsedSections("")).toEqual([]);
    // « administration » : ancienne section (gestion des membres, déplacée dans les paramètres).
    expect(parseCollapsedSections("documents.documents.<script>.projet.administration")).toEqual(["documents"]);
  });

  it("sérialise sans doublon, et supprime le cookie quand plus rien n'est replié", () => {
    expect(serializeCollapsedSections(["documents", "documents"])).toBe("documents");
    expect(serializeCollapsedSections([])).toBeNull();
  });

  it("aller-retour", () => {
    expect(parseCollapsedSections(serializeCollapsedSections(["documents"]) ?? undefined)).toEqual(["documents"]);
  });
});
