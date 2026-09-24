import { describe, expect, it } from "vitest";
import { zonedInstant, zonedParts } from "./dates";
import { clockDurationMs, endsNextDay, parseClockTime } from "./work-time";

describe("parseClockTime", () => {
  it.each([
    ["9", "09:00"],
    ["9h", "09:00"],
    ["9h30", "09:30"],
    ["9h05", "09:05"],
    ["930", "09:30"],
    ["0930", "09:30"],
    ["09:30", "09:30"],
    [" 18 h 15 ", "18:15"],
    ["23:59", "23:59"],
    ["0", "00:00"],
  ])("lit « %s » comme %s", (input, expected) => {
    expect(parseClockTime(input)).toBe(expected);
  });

  it.each(["", "24:00", "12:60", "abc", "9h300", "12345"])("refuse « %s »", (input) => {
    expect(parseClockTime(input)).toBeNull();
  });
});

describe("durée d'une période saisie", () => {
  it("passe minuit quand la fin précède le début", () => {
    expect(endsNextDay("22:00", "01:30")).toBe(true);
    expect(endsNextDay("09:00", "12:00")).toBe(false);
    expect(clockDurationMs("22:00", "01:30")).toBe(3.5 * 3_600_000);
    expect(clockDurationMs("09:00", "12:15")).toBe(3.25 * 3_600_000);
  });
});

describe("fuseau de l'équipe (Europe/Paris)", () => {
  it("convertit une heure locale en instant, été comme hiver", () => {
    expect(zonedInstant("2026-09-24", "09:30").toISOString()).toBe("2026-09-24T07:30:00.000Z");
    expect(zonedInstant("2026-12-01", "09:30").toISOString()).toBe("2026-12-01T08:30:00.000Z");
  });

  it("gère les jours de changement d'heure", () => {
    // 29 mars 2026 : passage à l'heure d'été à 2 h ; 25 octobre 2026 : retour à l'heure d'hiver à 3 h.
    expect(zonedInstant("2026-03-29", "12:00").toISOString()).toBe("2026-03-29T10:00:00.000Z");
    expect(zonedInstant("2026-10-25", "12:00").toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });

  it("relit la date et l'heure locales d'un instant", () => {
    expect(zonedParts("2026-09-24T22:15:00.000Z")).toEqual({ date: "2026-09-25", time: "00:15" });
  });
});
