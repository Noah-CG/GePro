import { describe, expect, it } from "vitest";
import {
  createsCycle,
  guideSegments,
  MAX_TASK_DEPTH,
  nestingError,
  nestSubtasks,
  subtreeEnd,
  taskRootColor,
  taskTree,
  withAncestors,
  type NestableTask,
} from "./task-links";

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

const t = (id: string, parentId: string | null = null, projectId = "p"): NestableTask => ({ id, parentId, projectId });

/** Chaîne a > b > c > d (4 niveaux) plus une tâche racine isolée x. */
const chain = [t("a"), t("b", "a"), t("c", "b"), t("d", "c"), t("x")];

describe("taskTree", () => {
  const tree = taskTree(chain);

  it("calcule profondeur, racine, ancêtres, descendants et hauteur", () => {
    expect(tree.depth("a")).toBe(0);
    expect(tree.depth("d")).toBe(3);
    expect(tree.rootId("d")).toBe("a");
    expect(tree.ancestors("c").map((x) => x.id)).toEqual(["b", "a"]);
    expect(tree.descendants("a").map((x) => x.id)).toEqual(["b", "c", "d"]);
    expect(tree.height("a")).toBe(3);
    expect(tree.height("d")).toBe(0);
  });

  it("ne boucle pas sur des données incohérentes", () => {
    const loop = taskTree([t("a", "b"), t("b", "a")]);
    expect(loop.ancestors("a").map((x) => x.id)).toEqual(["b"]);
    expect(loop.height("a")).toBeGreaterThanOrEqual(0);
  });
});

describe("nestingError", () => {
  it("autorise une nouvelle sous-tâche tant que la profondeur maximale n'est pas atteinte", () => {
    expect(MAX_TASK_DEPTH).toBe(4);
    expect(nestingError(chain, { id: null, projectId: "p" }, "c")).toBeNull();
    expect(nestingError(chain, { id: null, projectId: "p" }, "d")).toMatch(/niveaux/);
  });

  it("compte les sous-tâches de la tâche déplacée", () => {
    // b a deux niveaux sous elle : sous x, cela ferait x > b > c > d, soit 4 niveaux.
    expect(nestingError(chain, { id: "b", projectId: "p" }, "x")).toBeNull();
    // a en a trois : sous x, cela ferait 5 niveaux.
    expect(nestingError(chain, { id: "a", projectId: "p" }, "x")).toMatch(/niveaux/);
  });

  it("refuse soi-même, une parente inconnue ou d'un autre projet, et les boucles", () => {
    expect(nestingError(chain, { id: "a", projectId: "p" }, "a")).not.toBeNull();
    expect(nestingError(chain, { id: "x", projectId: "p" }, "inconnue")).toMatch(/introuvable/);
    expect(nestingError([...chain, t("y", null, "q")], { id: "x", projectId: "p" }, "y")).toMatch(/même projet/);
    expect(nestingError(chain, { id: "b", projectId: "p" }, "d")).toMatch(/propres sous-tâches/);
  });
});

describe("nestSubtasks", () => {
  it("range l'arbre en profondeur d'abord en gardant l'ordre entre sœurs", () => {
    const rows = nestSubtasks([t("s2", "a"), t("b"), t("a"), t("s1", "a"), t("g", "s2")]);
    expect(rows.map((r) => `${r.task.id}:${r.depth}:${r.rootId}`)).toEqual(["b:0:b", "a:0:a", "s2:1:a", "g:2:a", "s1:1:a"]);
    expect(rows.find((r) => r.task.id === "s2")?.hasChildren).toBe(true);
  });

  it("masque les descendants d'une tâche repliée", () => {
    expect(nestSubtasks(chain, new Set(["b"])).map((r) => r.task.id)).toEqual(["a", "b", "x"]);
  });

  it("laisse au premier niveau une sous-tâche dont la parente est absente", () => {
    expect(nestSubtasks([t("s", "absente"), t("b")]).map((r) => r.depth)).toEqual([0, 0]);
  });
});

describe("withAncestors", () => {
  it("ajoute les ancêtres manquants d'une sous-tâche trouvée, marqués comme contexte", () => {
    const { tasks, contextIds } = withAncestors([chain[2]], chain);
    expect(tasks.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect([...contextIds].sort()).toEqual(["a", "b"]);
  });
});

describe("guideSegments et subtreeEnd", () => {
  // racine
  //   A          (a une sœur plus bas)
  //     A1       (dernière sœur)
  //   B          (dernière sœur)
  const depths = [0, 1, 2, 1];

  it("prolonge la ligne vers une sœur plus bas et l'arrête à la dernière", () => {
    expect(guideSegments(depths, 0)).toEqual([]);
    expect(guideSegments(depths, 1)).toEqual(["through"]);
    expect(guideSegments(depths, 2)).toEqual(["through", "end"]);
    expect(guideSegments(depths, 3)).toEqual(["end"]);
  });

  it("n'affiche plus la ligne d'un ancêtre qui n'a plus de sœur en dessous", () => {
    expect(guideSegments([0, 1, 2, 3], 3)).toEqual(["none", "none", "end"]);
  });

  it("trouve la fin du sous-arbre", () => {
    expect(subtreeEnd(depths, 1)).toBe(2);
    expect(subtreeEnd(depths, 0)).toBe(3);
    expect(subtreeEnd(depths, 3)).toBe(3);
  });
});

describe("taskRootColor", () => {
  it("est stable pour un même id", () => {
    expect(taskRootColor("abc")).toBe(taskRootColor("abc"));
    expect(taskRootColor("abc")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
