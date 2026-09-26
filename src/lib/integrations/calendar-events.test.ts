import { describe, expect, it } from "vitest";
import { diffCalendar, googleEventId, nearestColorId, sourceOfGoogleId, toCalendarEvent, type CalendarItem } from "./calendar-events";

const EVENT_ID = "3b08fcaa-91af-45d6-ac57-fb01af8d079c";
const PROJECT_ID = "0d9b8e6a-1c2f-4b3a-9d8e-7f6a5b4c3d2e";

const event: CalendarItem = {
  kind: "event",
  id: EVENT_ID,
  title: "Réunion client",
  description: "Présentation de la maquette",
  date: "2026-09-30",
  color: "#f43f5e",
  projectId: PROJECT_ID,
  projectName: "Refonte du site",
};

const task: CalendarItem = {
  kind: "task",
  id: EVENT_ID,
  title: "Livrer la maquette",
  description: "",
  date: "2026-09-30",
  projectId: PROJECT_ID,
  projectName: "Refonte du site",
  projectColor: "#10b981",
};

describe("ids Google des éléments GePro", () => {
  it("dérive un id valide pour Google (a-v, 0-9) et sait le relire", () => {
    const id = googleEventId({ kind: "event", id: EVENT_ID });
    expect(id).toBe("gpe3b08fcaa91af45d6ac57fb01af8d079c");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(sourceOfGoogleId(id)).toEqual({ kind: "event", id: EVENT_ID });
    expect(sourceOfGoogleId(googleEventId({ kind: "task", id: EVENT_ID }))).toEqual({ kind: "task", id: EVENT_ID });
  });

  it("ne reconnaît pas les événements ajoutés à la main", () => {
    expect(sourceOfGoogleId("abc123def456")).toBeNull();
  });
});

describe("événement Google", () => {
  it("à la journée, fin exclusive au lendemain, sans rappel ni « occupé »", () => {
    const resource = toCalendarEvent(event, "https://gepro.exemple.fr");
    expect(resource).toMatchObject({
      id: "gpe3b08fcaa91af45d6ac57fb01af8d079c",
      summary: "Réunion client",
      start: { date: "2026-09-30" },
      end: { date: "2026-10-01" },
      transparency: "transparent",
      reminders: { useDefault: false },
      source: { title: "GePro", url: `https://gepro.exemple.fr/projets/${PROJECT_ID}/calendrier?vue=semaine&date=2026-09-30` },
    });
    expect(resource.description).toContain("Présentation de la maquette");
    expect(resource.description).toContain("Projet : Refonte du site");
  });

  it("préfixe les échéances et prend la couleur du projet", () => {
    const resource = toCalendarEvent(task, null);
    expect(resource.summary).toBe("Échéance : Livrer la maquette");
    expect(resource.colorId).toBe(nearestColorId("#10b981"));
    expect(resource).not.toHaveProperty("source");
  });

  it("franchit les fins de mois et d'année", () => {
    expect(toCalendarEvent({ ...event, date: "2026-12-31" }, null).end).toEqual({ date: "2027-01-01" });
  });

  it("empreinte stable, qui change avec le contenu", () => {
    const hash = (item: CalendarItem) => toCalendarEvent(item, null).extendedProperties.private.geproHash;
    expect(hash(event)).toBe(hash({ ...event }));
    expect(hash(event)).not.toBe(hash({ ...event, title: "Réunion déplacée" }));
    expect(hash(event)).not.toBe(hash({ ...event, date: "2026-10-01" }));
  });
});

describe("couleurs", () => {
  it("choisit la couleur Google la plus proche", () => {
    expect(nearestColorId("#d50000")).toBe("11");
    expect(nearestColorId("#0000ff")).toBe("9");
    expect(nearestColorId("rouge")).toBeUndefined();
  });
});

describe("écart entre GePro et l'agenda", () => {
  const a = toCalendarEvent(event, null);
  const b = toCalendarEvent(task, null);

  it("crée ce qui manque, met à jour ce qui a changé, supprime ce qui n'est plus attendu", () => {
    const diff = diffCalendar([a, b], [
      { id: a.id, hash: "ancienne" },
      { id: "gpt00000000000000000000000000000000", hash: "x" },
      { id: "ajoute-a-la-main", hash: null },
    ]);
    expect(diff.upserts.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(diff.deletes).toEqual(["gpt00000000000000000000000000000000"]);
  });

  it("ne touche à rien quand tout est à jour", () => {
    const diff = diffCalendar([a], [{ id: a.id, hash: a.extendedProperties.private.geproHash }]);
    expect(diff).toEqual({ upserts: [], deletes: [] });
  });
});
