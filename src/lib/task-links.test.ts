import { describe, expect, it } from "vitest";
import { createsCycle, nestingError, nestSubtasks, type NestableTask } from "./task-links";

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

describe("nestingError", () => {
  const task = (id: string, extra: Partial<NestableTask> = {}): NestableTask => ({ id, projectId: "p", parentId: null, subtasks: { total: 0 }, ...extra });

  it("autorise deux tâches principales du même projet", () => {
    expect(nestingError(task("a"), task("b"))).toBeNull();
  });

  it("autorise de changer de parente", () => {
    expect(nestingError(task("a", { parentId: "c" }), task("b"))).toBeNull();
  });

  it("refuse soi-même, la parente actuelle, un autre projet, une sous-tâche ou une tâche qui a des sous-tâches", () => {
    expect(nestingError(task("a"), task("a"))).not.toBeNull();
    expect(nestingError(task("a", { parentId: "b" }), task("b"))).not.toBeNull();
    expect(nestingError(task("a"), task("b", { projectId: "q" }))).not.toBeNull();
    expect(nestingError(task("a"), task("b", { parentId: "c" }))).not.toBeNull();
    expect(nestingError(task("a", { subtasks: { total: 1 } }), task("b"))).not.toBeNull();
  });
});

describe("nestSubtasks", () => {
  const t = (id: string, parentId: string | null = null) => ({ id, parentId });

  it("range les sous-tâches sous leur parente en gardant l'ordre", () => {
    const rows = nestSubtasks([t("s2", "a"), t("b"), t("a"), t("s1", "a")]);
    expect(rows.map((r) => `${r.task.id}:${r.depth}`)).toEqual(["b:0", "a:0", "s2:1", "s1:1"]);
  });

  it("laisse au premier niveau une sous-tâche dont la parente est filtrée", () => {
    expect(nestSubtasks([t("s", "absente"), t("b")]).map((r) => r.depth)).toEqual([0, 0]);
  });
});
