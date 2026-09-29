import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { buildJournalPdf, entryHeading, toPdfText, wrapText } from "./journal-pdf";

let font: PDFFont;

beforeAll(async () => {
  font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
});

describe("toPdfText", () => {
  it("garde le français, remplace ce que Helvetica ne sait pas écrire", () => {
    expect(toPdfText("Œuvre « déjà » vue – 12 € … ça", font)).toBe("Œuvre « déjà » vue – 12 € … ça");
    expect(toPdfText("Top 👍🏽 ❤️ 日本\tfin !", font)).toBe("Top ?? ? ?? fin !");
  });
});

describe("wrapText", () => {
  it("coupe aux espaces, garde les retours à la ligne et les lignes vides", () => {
    const lines = wrapText("un deux trois quatre\n\ncinq", font, 10, font.widthOfTextAtSize("un deux trois", 10));
    expect(lines).toEqual(["un deux trois", "quatre", "", "cinq"]);
  });

  it("coupe un mot trop long pour une ligne", () => {
    const lines = wrapText("https://exemple.fr/un/chemin/tres/long", font, 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("https://exemple.fr/un/chemin/tres/long");
    for (const line of lines) expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(60);
  });
});

describe("entryHeading", () => {
  it("date, heures et auteur ; date de fin précisée pour une période sur deux jours", () => {
    const author = "Camille Martin";
    expect(entryHeading({ startedAt: "2026-09-02T21:00:00Z", endedAt: "2026-09-02T23:15:00Z", author, note: "" })).toBe(
      "mercredi 2 septembre 2026 · 23:00 – 3 sept. 2026 01:15 · Camille Martin",
    );
    expect(entryHeading({ startedAt: "2026-09-02T08:00:00Z", endedAt: null, author, note: "" })).toBe(
      "mercredi 2 septembre 2026 · 10:00 – en cours · Camille Martin",
    );
  });
});

describe("buildJournalPdf", () => {
  it("passe à la page suivante quand le texte déborde", async () => {
    const note = Array.from({ length: 30 }, (_, i) => `Ligne ${i + 1}`).join("\n");
    const entries = Array.from({ length: 6 }, (_, i) => ({
      startedAt: `2026-09-0${i + 1}T08:00:00Z`,
      endedAt: `2026-09-0${i + 1}T09:00:00Z`,
      author: "Camille Martin",
      note,
    }));
    const bytes = await buildJournalPdf({ projectName: "Refonte", scopeLabel: "Camille Martin", periodLabel: "Depuis le début", exportedAt: "29 sept. 2026 à 10:00", entries });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
});
