/**
 * Export PDF du journal de bord d'un projet : pour chaque entrée, une ligne « date · heure ·
 * auteur » en gras, puis, à la ligne, le compte rendu tel qu'il a été rédigé.
 *
 * Polices standard du PDF (Helvetica) : rien à embarquer, mais seul le jeu de caractères
 * WinAnsi est disponible (accents français, « », œ, €, – compris). Les autres caractères
 * (émojis, alphabets non latins) sont remplacés par « ? » plutôt que de faire échouer l'export.
 */
import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDayLong, formatLong, zonedParts } from "./dates";
import type { JournalEntry } from "./queries";

const PAGE = { width: 595.28, height: 841.89 }; // A4, en points
const MARGIN = 56;
const TEXT_WIDTH = PAGE.width - 2 * MARGIN;
const BODY = { size: 10.5, leading: 14.5 };
const FOOTER_Y = 32;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.47);
const RULE = rgb(0.85, 0.85, 0.88);

/** Caractères invisibles sans équivalent : supprimés (sélecteurs de variante, liant des émojis…). */
const INVISIBLE = /[​-‍⁠︀-️\u{e0020}-\u{e007f}]/gu;

/** Texte affichable avec `font` : espaces insécables normalisés, caractères absents remplacés par « ? ». */
export function toPdfText(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const char of text.normalize("NFC").replace(INVISIBLE, "").replace(/[  \t]/g, " ")) {
    const code = char.codePointAt(0)!;
    if (char === "\n" || supported.has(code)) out += char;
    else if (code >= 0x20) out += "?";
  }
  return out;
}

/**
 * Découpe `text` en lignes d'au plus `maxWidth` points : aux espaces, et au milieu d'un mot
 * trop long pour tenir sur une ligne (adresse, identifiant…). Les retours à la ligne et les
 * lignes vides du texte sont conservés.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const width = (s: string) => font.widthOfTextAtSize(s, size);
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      // Mot plus large qu'une ligne : coupé caractère par caractère.
      for (const char of word) {
        if (line && width(line + char) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** « jeudi 24 septembre 2026 · 14:00 – 16:30 · Camille Martin » (fuseau de l'équipe). */
export function entryHeading({ startedAt, endedAt, author }: JournalEntry): string {
  const start = zonedParts(startedAt);
  const end = endedAt ? zonedParts(endedAt) : null;
  // Période sur plusieurs jours (travail de nuit) : la date de fin est précisée.
  const until = !end ? "en cours" : end.date === start.date ? end.time : `${formatLong(end.date)} ${end.time}`;
  return `${formatDayLong(start.date)} · ${start.time} – ${until} · ${author}`;
}

export type JournalPdfInput = {
  projectName: string;
  /** « Camille Martin » ou « Toute l'équipe ». */
  scopeLabel: string;
  /** « Depuis le début », « Du 1 sept. 2026 au 29 sept. 2026 »… */
  periodLabel: string;
  /** « 29 sept. 2026 à 10:42 » */
  exportedAt: string;
  entries: JournalEntry[];
};

export async function buildJournalPdf({ projectName, scopeLabel, periodLabel, exportedAt, entries }: JournalPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(toPdfText(`Journal de bord · ${projectName}`, regular));
  doc.setCreator("GePro");
  doc.setLanguage("fr-FR");

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;
  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  };
  const room = () => y - (FOOTER_Y + 24);
  const draw = (lines: string[], font: PDFFont, size: number, leading: number, color = INK) => {
    for (const line of lines) {
      if (room() < leading) newPage();
      y -= leading;
      if (line) page.drawText(line, { x: MARGIN, y, size, font, color });
    }
  };

  // En-tête du document.
  draw(wrapText(toPdfText(`Journal de bord · ${projectName}`, bold), bold, 17, TEXT_WIDTH), bold, 17, 22);
  const count = entries.length === 1 ? "1 entrée" : `${entries.length} entrées`;
  draw(wrapText(toPdfText(`${scopeLabel} · ${periodLabel} · ${count}`, regular), regular, 10, TEXT_WIDTH), regular, 10, 16, MUTED);
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 0.75, color: RULE });
  y -= 8;

  if (entries.length === 0) draw(["Aucune entrée rédigée sur cette période."], regular, BODY.size, BODY.leading * 2, MUTED);

  for (const entry of entries) {
    const heading = wrapText(toPdfText(entryHeading(entry), bold), bold, BODY.size, TEXT_WIDTH);
    const body = wrapText(toPdfText(entry.note.trim(), regular), regular, BODY.size, TEXT_WIDTH);
    // L'en-tête d'une entrée ne reste jamais seul en bas de page.
    if (room() < 12 + (heading.length + 1) * BODY.leading) newPage();
    else y -= 12;
    draw(heading, bold, BODY.size, BODY.leading);
    draw(body, regular, BODY.size, BODY.leading);
  }

  // Pied de page, une fois le nombre de pages connu.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const left = toPdfText(`GePro · ${projectName} · exporté le ${exportedAt}`, regular);
    p.drawText(left, { x: MARGIN, y: FOOTER_Y, size: 8, font: regular, color: MUTED });
    const right = `Page ${i + 1} / ${pages.length}`;
    p.drawText(right, { x: PAGE.width - MARGIN - regular.widthOfTextAtSize(right, 8), y: FOOTER_Y, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}
