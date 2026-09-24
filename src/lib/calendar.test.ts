import { describe, expect, it } from "vitest";
import {
  dayAriaLabel,
  groupByDay,
  monthWeeks,
  periodTitle,
  readCalendarParams,
  shiftPeriod,
  visibleRange,
  weekDays,
} from "./calendar";
import { addMonths, startOfWeekISO } from "./dates";
import type { CalendarEvent, TaskView } from "./queries";

const task = (id: string, dueDate: string, status: TaskView["status"] = "todo"): TaskView => ({
  id,
  projectId: "p",
  projectName: "Projet",
  projectColor: "#6366f1",
  title: id,
  description: "",
  status,
  priority: "medium",
  dueDate,
  position: 0,
  assigneeIds: [],
});

const event = (id: string, date: string): CalendarEvent => ({
  id,
  projectId: null,
  projectName: null,
  projectColor: null,
  title: id,
  description: "",
  date,
  color: "#f43f5e",
  createdBy: null,
});

describe("grille d'un mois", () => {
  it("septembre 2026 : 5 semaines du lundi 31 août au dimanche 4 octobre", () => {
    const weeks = monthWeeks("2026-09-24");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-08-31");
    expect(weeks[4][6]).toBe("2026-10-04");
    expect(weeks.flat()).toContain("2026-09-01");
    expect(weeks.flat()).toContain("2026-09-30");
  });

  it("chaque semaine compte 7 jours consécutifs, du lundi au dimanche", () => {
    for (const week of monthWeeks("2026-09-24")) {
      expect(week).toHaveLength(7);
      expect(startOfWeekISO(week[0])).toBe(week[0]);
      expect(new Date(`${week[0]}T00:00:00Z`).getUTCDay()).toBe(1); // lundi
      expect(new Date(`${week[6]}T00:00:00Z`).getUTCDay()).toBe(0); // dimanche
    }
    // Les semaines se suivent sans trou ni doublon.
    const days = monthWeeks("2026-09-24").flat();
    expect(new Set(days).size).toBe(days.length);
  });

  it("un mois qui commence un lundi ne déborde pas sur le mois précédent (juin 2026)", () => {
    const weeks = monthWeeks("2026-06-15");
    expect(weeks[0][0]).toBe("2026-06-01");
    expect(weeks).toHaveLength(5);
  });

  it("février 2027 tient exactement en 4 semaines (commence un lundi, finit un dimanche)", () => {
    const weeks = monthWeeks("2027-02-10");
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe("2027-02-01");
    expect(weeks[3][6]).toBe("2027-02-28");
  });

  it("août 2026 s'étale sur 6 semaines (commence un samedi, finit un lundi)", () => {
    const weeks = monthWeeks("2026-08-01");
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0]).toBe("2026-07-27");
    expect(weeks[5][6]).toBe("2026-09-06");
  });

  it("février d'une année bissextile (2028) inclut le 29", () => {
    expect(monthWeeks("2028-02-01").flat()).toContain("2028-02-29");
  });
});

describe("semaines à cheval sur deux mois", () => {
  it("fin septembre → début octobre", () => {
    expect(weekDays("2026-09-30")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("changement d'année : du lundi 28 décembre 2026 au dimanche 3 janvier 2027", () => {
    const days = weekDays("2027-01-02");
    expect(days[0]).toBe("2026-12-28");
    expect(days[6]).toBe("2027-01-03");
  });

  it("un dimanche appartient à la semaine qui le précède", () => {
    expect(weekDays("2026-10-04")[0]).toBe("2026-09-28");
  });

  it("la même semaine apparaît dans la grille des deux mois", () => {
    const week = weekDays("2026-09-30");
    expect(monthWeeks("2026-09-15")).toContainEqual(week);
    expect(monthWeeks("2026-10-15")).toContainEqual(week);
  });
});

describe("intervalle et navigation", () => {
  it("l'intervalle lu en base couvre exactement les jours affichés", () => {
    expect(visibleRange("mois", "2026-09-24")).toEqual({ from: "2026-08-31", to: "2026-10-04" });
    expect(visibleRange("semaine", "2026-09-24")).toEqual({ from: "2026-09-21", to: "2026-09-27" });
  });

  it("mois précédent / suivant, ramené au dernier jour du mois si besoin", () => {
    expect(shiftPeriod("mois", "2026-09-24", 1)).toBe("2026-10-24");
    expect(shiftPeriod("mois", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftPeriod("mois", "2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("semaine précédente / suivante", () => {
    expect(shiftPeriod("semaine", "2026-09-24", -1)).toBe("2026-09-17");
    expect(shiftPeriod("semaine", "2026-12-30", 1)).toBe("2027-01-06");
  });

  it("titre de la période", () => {
    expect(periodTitle("mois", "2026-09-24")).toBe("septembre 2026");
    expect(periodTitle("semaine", "2026-09-30")).toBe("28 sept. – 4 oct. 2026");
  });
});

describe("paramètres d'adresse", () => {
  const today = "2026-09-24";

  it("par défaut : le mois d'aujourd'hui", () => {
    expect(readCalendarParams({}, today)).toEqual({ view: "mois", date: today });
  });

  it("lit la vue et la date", () => {
    expect(readCalendarParams({ vue: "semaine", date: "2026-10-02" }, today)).toEqual({ view: "semaine", date: "2026-10-02" });
  });

  it("ignore les valeurs invalides", () => {
    expect(readCalendarParams({ vue: "annee", date: "2026-09-31" }, today)).toEqual({ view: "mois", date: today });
    expect(readCalendarParams({ vue: ["semaine"], date: "demain" }, today)).toEqual({ view: "mois", date: today });
  });
});

describe("contenu des jours", () => {
  it("regroupe par jour, tâches ouvertes avant les terminées", () => {
    const byDay = groupByDay({
      tasks: [task("finie", "2026-09-24", "done"), task("ouverte", "2026-09-24"), task("autre jour", "2026-09-25")],
      events: [event("comité", "2026-09-24")],
    });
    expect(byDay.get("2026-09-24")?.tasks.map((t) => t.id)).toEqual(["ouverte", "finie"]);
    expect(byDay.get("2026-09-24")?.events.map((e) => e.id)).toEqual(["comité"]);
    expect(byDay.get("2026-09-25")?.tasks).toHaveLength(1);
  });

  it("décrit un jour pour les lecteurs d'écran, retard compris", () => {
    const items = { tasks: [task("a", "2026-09-22"), task("b", "2026-09-22", "done")], events: [event("e", "2026-09-22")] };
    expect(dayAriaLabel("2026-09-22", "2026-09-24", items)).toBe("mardi 22 septembre 2026, 2 tâches dont 1 en retard, 1 événement");
    expect(dayAriaLabel("2026-09-24", "2026-09-24", undefined)).toBe("jeudi 24 septembre 2026, aujourd'hui, aucun élément");
  });
});
