import { describe, expect, it } from "vitest";
import { formatCountdown, formatWeekdayDayMonth } from "./dates";

describe("formatWeekdayDayMonth", () => {
  it("formate une date en français, sans décalage de fuseau", () => {
    expect(formatWeekdayDayMonth("2026-03-12")).toBe("jeu. 12 mars");
    expect(formatWeekdayDayMonth("2026-01-01")).toBe("jeu. 1 janv.");
  });
});

describe("formatCountdown", () => {
  const today = "2026-03-10";

  it("compte les jours jusqu'à la date", () => {
    expect(formatCountdown("2026-03-10", today)).toBe("aujourd'hui");
    expect(formatCountdown("2026-03-11", today)).toBe("demain");
    expect(formatCountdown("2026-03-15", today)).toBe("dans 5 jours");
  });

  it("gère les dates passées et le changement d'heure", () => {
    expect(formatCountdown("2026-03-09", today)).toBe("hier");
    expect(formatCountdown("2026-03-07", today)).toBe("il y a 3 jours");
    // Passage à l'heure d'été le 29 mars 2026 : toujours 3 jours.
    expect(formatCountdown("2026-03-31", "2026-03-28")).toBe("dans 3 jours");
  });
});
