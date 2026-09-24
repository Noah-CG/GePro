import { describe, expect, it } from "vitest";
import { DOC_ID } from "@/test/google";
import { parseDocId } from "./doc-links";

describe("parseDocId", () => {
  it.each([
    [`https://docs.google.com/document/d/${DOC_ID}/edit`, DOC_ID],
    [`https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing#heading=h.1`, DOC_ID],
    [`https://docs.google.com/document/u/1/d/${DOC_ID}/edit`, DOC_ID],
    [`https://docs.google.com/a/societe.fr/document/d/${DOC_ID}/view`, DOC_ID],
    [`https://drive.google.com/file/d/${DOC_ID}/view`, DOC_ID],
    [`https://drive.google.com/open?id=${DOC_ID}`, DOC_ID],
    [`  ${DOC_ID}  `, DOC_ID],
  ])("reconnaît %s", (input, expected) => {
    expect(parseDocId(input)).toBe(expected);
  });

  it.each([
    "",
    "cahier des charges",
    `https://docs.google.com/spreadsheets/d/${DOC_ID}/edit`,
    `https://evil.example.com/document/d/${DOC_ID}/edit`,
    `javascript:alert(1)//docs.google.com/document/d/${DOC_ID}`,
    "https://drive.google.com/open?id=court",
  ])("refuse %j", (input) => {
    expect(parseDocId(input)).toBeNull();
  });
});
