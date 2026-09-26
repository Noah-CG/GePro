/**
 * Contrastes WCAG AA des jetons de couleur de globals.css : textes de l'arbre des tâches sur le
 * fond de chaque niveau, en clair comme en sombre.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./utils";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** Jetons "--nom: #rrggbb" d'un bloc (":root" ou ".dark"). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

describe.each([
  ["clair", tokens(":root")],
  ["sombre", tokens(".dark")],
])("arbre des tâches, thème %s", (_, t) => {
  const levels = [0, 1, 2, 3].map((i) => t[`task-level-${i}`]);

  it("définit un fond par niveau, chacun différent du précédent", () => {
    expect(levels.every(Boolean)).toBe(true);
    expect(new Set(levels).size).toBe(4);
  });

  it.each(["text", "task-muted", "task-warning", "task-success", "task-danger", "accent"])("%s reste lisible (4,5:1) à tous les niveaux", (name) => {
    for (const bg of levels) expect(contrastRatio(t[name], bg)).toBeGreaterThanOrEqual(4.5);
  });
});
