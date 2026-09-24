import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filtersFromParams, filtersToParams, type TaskFilters } from "./filters";

const MEMBER = "0d9b8e6a-1c2f-4b3a-9d8e-7f6a5b4c3d2e";
const PROJECT = "3b08fcaa-91af-45d6-ac57-fb01af8d079c";

const read = (query: string) => filtersFromParams(new URLSearchParams(query));

describe("filtres dans l'adresse", () => {
  it("sans paramètre : filtres par défaut", () => {
    expect(read("")).toEqual(DEFAULT_FILTERS);
  });

  it("reste compatible avec les liens du tableau de bord", () => {
    expect(read("vue=liste&echeance=overdue&responsable=moi")).toEqual({ ...DEFAULT_FILTERS, due: "overdue", assignee: "me" });
  });

  it("lit tous les filtres", () => {
    expect(read(`recherche=maquette&responsable=${MEMBER}&priorite=high&statut=in_progress&echeance=week&projet=${PROJECT}`)).toEqual({
      q: "maquette",
      assignee: MEMBER,
      priority: "high",
      status: "in_progress",
      due: "week",
      project: PROJECT,
    });
    expect(read("responsable=aucun").assignee).toBe("none");
  });

  it("ignore les valeurs inconnues", () => {
    expect(read("priorite=urgente&statut=x&echeance=hier&responsable=quelqu-un&projet=pas-un-id")).toEqual(DEFAULT_FILTERS);
  });

  it("écrit seulement les filtres actifs et garde les autres paramètres", () => {
    const filters: TaskFilters = { ...DEFAULT_FILTERS, q: "logo", assignee: "me", priority: "low" };
    expect(filtersToParams(filters, new URLSearchParams("vue=liste&echeance=today")).toString()).toBe(
      "vue=liste&recherche=logo&responsable=moi&priorite=low",
    );
  });

  it("aller-retour", () => {
    const filters: TaskFilters = { q: "a b & c", assignee: "none", priority: "medium", status: "done", due: "none", project: PROJECT };
    expect(filtersFromParams(filtersToParams(filters, new URLSearchParams()))).toEqual(filters);
  });
});
