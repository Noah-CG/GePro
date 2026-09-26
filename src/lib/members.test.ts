import { describe, expect, it } from "vitest";
import { membersSettingsHref } from "./members";

describe("adresse de la gestion des membres", () => {
  it("pointe vers la section Membres des paramètres du projet", () => {
    expect(membersSettingsHref("p1")).toBe("/projets/p1/parametres#membres");
  });

  it("renvoie vers la liste des projets quand il n'y en a aucun", () => {
    expect(membersSettingsHref(null)).toBe("/projets");
  });
});
