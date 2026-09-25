import { describe, expect, it } from "vitest";
import { googleCalendarUrl } from "./google-calendar";

const params = (url: string | null) => new URL(url!).searchParams;

describe("googleCalendarUrl", () => {
  it("sans date, pas de lien", () => {
    expect(googleCalendarUrl({ title: "A" })).toBeNull();
  });

  it("échéance seule : une journée entière (fin exclusive)", () => {
    const p = params(googleCalendarUrl({ title: "Livrer", dueDate: "2026-09-30" }));
    expect(p.get("action")).toBe("TEMPLATE");
    expect(p.get("text")).toBe("Livrer");
    expect(p.get("dates")).toBe("20260930/20261001");
  });

  it("du début à l'échéance, y compris en changeant de mois", () => {
    expect(params(googleCalendarUrl({ title: "A", startDate: "2026-09-28", dueDate: "2026-10-31" })).get("dates")).toBe("20260928/20261101");
  });

  it("début seul, ou début après l'échéance : une seule journée", () => {
    expect(params(googleCalendarUrl({ title: "A", startDate: "2026-09-28" })).get("dates")).toBe("20260928/20260929");
    expect(params(googleCalendarUrl({ title: "A", startDate: "2026-10-05", dueDate: "2026-10-01" })).get("dates")).toBe("20261001/20261002");
  });

  it("met la description, le projet et le lien vers GePro dans les détails", () => {
    const p = params(
      googleCalendarUrl({ title: "A", dueDate: "2026-09-30", description: "Texte", projectName: "Site", link: "https://gepro.test/projets/1?tache=2" }),
    );
    expect(p.get("details")).toBe("Texte\n\nProjet : Site\nOuvrir dans GePro : https://gepro.test/projets/1?tache=2");
  });

  it("tronque une description très longue", () => {
    const details = params(googleCalendarUrl({ title: "A", dueDate: "2026-09-30", description: "x".repeat(5000) })).get("details")!;
    expect(details.length).toBeLessThan(1600);
  });
});
