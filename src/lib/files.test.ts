import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  chunkCount,
  chunkSpan,
  cleanFileName,
  expectedChunkSize,
  fileTitle,
  formatFileSize,
  isPdfSignature,
  MAX_FILE_SIZE,
  parseRange,
  pdfFileError,
} from "./files";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("découpage en morceaux", () => {
  it("compte les morceaux, dont un dernier plus petit", () => {
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(CHUNK_SIZE)).toBe(1);
    expect(chunkCount(CHUNK_SIZE + 1)).toBe(2);
    expect(chunkCount(MAX_FILE_SIZE)).toBe(22);
  });

  it("donne la taille attendue de chaque morceau", () => {
    const size = 2 * CHUNK_SIZE + 10;
    expect([0, 1, 2].map((p) => expectedChunkSize(size, p))).toEqual([CHUNK_SIZE, CHUNK_SIZE, 10]);
  });

  it("trouve les morceaux qui contiennent une plage", () => {
    expect(chunkSpan({ start: 0, end: 99 })).toEqual({ first: 0, last: 0 });
    expect(chunkSpan({ start: CHUNK_SIZE - 1, end: CHUNK_SIZE })).toEqual({ first: 0, last: 1 });
    expect(chunkSpan({ start: 2 * CHUNK_SIZE, end: 3 * CHUNK_SIZE - 1 })).toEqual({ first: 2, last: 2 });
  });
});

describe("isPdfSignature", () => {
  it("reconnaît l'en-tête d'un PDF, même précédé de quelques octets", () => {
    expect(isPdfSignature(bytes("%PDF-1.7\n%âãÏÓ"))).toBe(true);
    expect(isPdfSignature(bytes("\uFEFF\n%PDF-1.4"))).toBe(true);
  });

  it("refuse les autres fichiers", () => {
    expect(isPdfSignature(bytes("PK\u0003\u0004 archive zip"))).toBe(false);
    expect(isPdfSignature(bytes("<html>%PDF</html>"))).toBe(false);
    expect(isPdfSignature(new Uint8Array())).toBe(false);
    // En-tête trop loin : ce n'est pas un PDF lisible.
    expect(isPdfSignature(bytes(`${"x".repeat(1024)}%PDF-1.7`))).toBe(false);
  });
});

describe("pdfFileError", () => {
  it("accepte un PDF, par son type ou son extension", () => {
    expect(pdfFileError({ name: "cahier-des-charges.pdf", size: 1000, type: "application/pdf" })).toBeNull();
    expect(pdfFileError({ name: "COMPTE-RENDU.PDF", size: 1000, type: "" })).toBeNull();
  });

  it.each([
    ["un autre format", { name: "notes.docx", size: 1000, type: "application/msword" }, "Seuls les fichiers PDF peuvent être importés."],
    ["un fichier vide", { name: "vide.pdf", size: 0 }, "Ce fichier est vide."],
    ["un fichier trop gros", { name: "plans.pdf", size: MAX_FILE_SIZE + 1 }, "Ce fichier dépasse la taille maximale de 20 Mo."],
  ])("refuse %s", (_, file, error) => {
    expect(pdfFileError(file)).toBe(error);
  });
});

describe("noms de fichier", () => {
  it("garde le nom seul, sans chemin ni caractères de contrôle", () => {
    expect(cleanFileName("C:\\Users\\camille\\Rapport  final.pdf")).toBe("Rapport final.pdf");
    expect(cleanFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(cleanFileName("Plan\u0000\n.pdf")).toBe("Plan.pdf");
    expect(cleanFileName("   ")).toBe("Document.pdf");
    expect(cleanFileName(`${"a".repeat(300)}.pdf`)).toHaveLength(200);
  });

  it("retire l'extension du titre", () => {
    expect(fileTitle("Cahier des charges.pdf")).toBe("Cahier des charges");
    expect(fileTitle("Plan.PDF")).toBe("Plan");
    expect(fileTitle(".pdf")).toBe(".pdf");
  });

  it("formate les tailles en français", () => {
    expect(formatFileSize(512)).toBe("512 o");
    expect(formatFileSize(340 * 1024)).toBe("340 Ko");
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe("1,3 Mo");
    expect(formatFileSize(MAX_FILE_SIZE)).toBe("20 Mo");
  });
});

describe("parseRange", () => {
  const size = 1000;

  it("lit les plages simples", () => {
    expect(parseRange("bytes=0-99", size)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", size)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", size)).toEqual({ start: 900, end: 999 });
  });

  it("borne la fin au dernier octet du fichier", () => {
    expect(parseRange("bytes=500-5000", size)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=-5000", size)).toEqual({ start: 0, end: 999 });
  });

  it("ignore l'en-tête absent ou non géré (tout le fichier est renvoyé)", () => {
    expect(parseRange(null, size)).toBeNull();
    expect(parseRange("bytes=0-10,20-30", size)).toBeNull();
    expect(parseRange("items=0-10", size)).toBeNull();
    expect(parseRange("bytes=-", size)).toBeNull();
  });

  it("signale une plage hors du fichier", () => {
    expect(parseRange("bytes=1000-", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=500-100", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", size)).toBe("unsatisfiable");
  });
});
