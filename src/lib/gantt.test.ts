import { describe, expect, it } from "vitest";
import { barBox, ganttMonths, ganttRange, planTasks, shiftSpan, spanDays, taskSpan } from "./gantt";

const task = (id: string, startDate: string | null, dueDate: string | null, position = 0) => ({ id, startDate, dueDate, position });

describe("taskSpan", () => {
  it("va du début à l'échéance", () => {
    expect(taskSpan(task("a", "2026-09-21", "2026-09-25"))).toEqual({ start: "2026-09-21", end: "2026-09-25" });
  });

  it("occupe un seul jour avec une seule des deux dates", () => {
    expect(taskSpan(task("a", null, "2026-09-25"))).toEqual({ start: "2026-09-25", end: "2026-09-25" });
    expect(taskSpan(task("a", "2026-09-21", null))).toEqual({ start: "2026-09-21", end: "2026-09-21" });
  });

  it("n'est pas placée sans aucune date", () => {
    expect(taskSpan(task("a", null, null))).toBeNull();
  });

  it("remet dans l'ordre un début postérieur à l'échéance", () => {
    expect(taskSpan(task("a", "2026-09-30", "2026-09-25"))).toEqual({ start: "2026-09-25", end: "2026-09-30" });
  });
});

describe("ganttRange", () => {
  it("couvre les tâches et aujourd'hui avec une marge, en semaines entières du lundi au dimanche", () => {
    const range = ganttRange([{ start: "2026-10-01", end: "2026-12-15" }], "2026-09-24");
    // 24/09 - 14 j = 10/09 (jeudi) → lundi 07/09 ; 15/12 + 14 j = 29/12 (mardi) → dimanche 03/01.
    expect(range).toEqual({ start: "2026-09-07", end: "2027-01-03" });
    expect(spanDays(range) % 7).toBe(0);
  });

  it("affiche au moins huit semaines", () => {
    const range = ganttRange([], "2026-09-24");
    expect(range.start).toBe("2026-09-07");
    expect(spanDays(range)).toBe(56);
  });

  it("s'allonge pour remplir l'écran, toujours jusqu'à un dimanche", () => {
    const range = ganttRange([], "2026-09-24", 100);
    expect(range).toEqual({ start: "2026-09-07", end: "2026-12-20" });
    expect(spanDays(range)).toBe(105);
  });
});

describe("barBox", () => {
  it("place la barre en jours depuis le début de la période, bornes incluses", () => {
    expect(barBox({ start: "2026-09-09", end: "2026-09-11" }, { start: "2026-09-07", end: "2026-11-01" })).toEqual({ offset: 2, days: 3 });
  });
});

describe("shiftSpan", () => {
  const span = { start: "2026-09-21", end: "2026-09-25" };

  it("déplace les deux dates", () => {
    expect(shiftSpan(span, "move", 3)).toEqual({ start: "2026-09-24", end: "2026-09-28" });
    expect(shiftSpan(span, "move", -21)).toEqual({ start: "2026-08-31", end: "2026-09-04" });
  });

  it("change le début sans dépasser l'échéance", () => {
    expect(shiftSpan(span, "start", -2)).toEqual({ start: "2026-09-19", end: "2026-09-25" });
    expect(shiftSpan(span, "start", 10)).toEqual({ start: "2026-09-25", end: "2026-09-25" });
  });

  it("change l'échéance sans passer avant le début", () => {
    expect(shiftSpan(span, "end", 5)).toEqual({ start: "2026-09-21", end: "2026-09-30" });
    expect(shiftSpan(span, "end", -10)).toEqual({ start: "2026-09-21", end: "2026-09-21" });
  });
});

describe("ganttMonths", () => {
  it("découpe la période par mois", () => {
    expect(ganttMonths({ start: "2026-09-28", end: "2026-11-01" })).toEqual([
      { key: "2026-09", start: "2026-09-28", days: 3 },
      { key: "2026-10", start: "2026-10-01", days: 31 },
      { key: "2026-11", start: "2026-11-01", days: 1 },
    ]);
  });
});

describe("planTasks", () => {
  it("trie les tâches datées par début, puis échéance, puis position, et met les autres à part", () => {
    const { planned, unplanned } = planTasks([
      task("tard", "2026-10-05", "2026-10-09"),
      task("sans", null, null),
      task("long", "2026-09-21", "2026-10-02"),
      task("court-2", "2026-09-21", "2026-09-23", 2),
      task("court-1", "2026-09-21", "2026-09-23", 1),
    ]);
    expect(planned.map((p) => p.task.id)).toEqual(["court-1", "court-2", "long", "tard"]);
    expect(unplanned.map((t) => t.id)).toEqual(["sans"]);
  });
});
