import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

function get(...chemin: string[]) {
  const request = new NextRequest(`http://localhost/api/pdfjs/6.3.289/${chemin.join("/")}`);
  return GET(request, { params: Promise.resolve({ version: "6.3.289", chemin }) });
}

describe("GET /api/pdfjs/[version]/[...chemin]", () => {
  it("sert les fichiers annexes de pdf.js, en cache longue durée", async () => {
    const wasm = await get("wasm", "openjpeg.wasm");
    expect(wasm.status).toBe(200);
    expect(wasm.headers.get("content-type")).toBe("application/wasm");
    expect(wasm.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    // Signature d'un module WebAssembly : "\0asm".
    expect(Array.from(new Uint8Array(await wasm.arrayBuffer()).subarray(0, 4))).toEqual([0, 0x61, 0x73, 0x6d]);

    expect((await get("wasm", "jbig2_nowasm_fallback.js")).headers.get("content-type")).toBe("text/javascript");
    expect((await get("cmaps", "UniJIS-UTF16-H.bcmap")).status).toBe(200);
    expect((await get("standard_fonts", "FoxitSerif.pfb")).status).toBe(200);
  });

  it.each([
    ["un dossier non prévu", ["build", "pdf.mjs"]],
    ["une remontée de dossier", ["cmaps", "..", "package.json"]],
    ["un chemin trop long", ["wasm", "sous", "openjpeg.wasm"]],
    ["un fichier non prévu", ["wasm", "quickjs-eval.wasm"]],
    ["un fichier absent", ["cmaps", "Inexistant.bcmap"]],
  ])("refuse %s", async (_, chemin) => {
    expect((await get(...chemin)).status).toBe(404);
  });
});
