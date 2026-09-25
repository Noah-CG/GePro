import { describe, expect, it } from "vitest";
import { createsCycle } from "./task-links";

describe("createsCycle", () => {
  it("accepte une chaîne sans retour", () => {
    expect(createsCycle([{ taskId: "b", dependsOnId: "c" }], "a", ["b"])).toBe(false);
  });

  it("refuse de dépendre de soi-même", () => {
    expect(createsCycle([], "a", ["a"])).toBe(true);
  });

  it("refuse un cycle indirect", () => {
    const edges = [
      { taskId: "b", dependsOnId: "c" },
      { taskId: "c", dependsOnId: "a" },
    ];
    expect(createsCycle(edges, "a", ["b"])).toBe(true);
  });

  it("ignore les anciennes dépendances de la tâche modifiée", () => {
    expect(createsCycle([{ taskId: "a", dependsOnId: "b" }], "a", ["c"])).toBe(false);
  });
});
