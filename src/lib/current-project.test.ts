import { describe, expect, it } from "vitest";
import { projectIdFromPath, projectSwitchHref, resolveSelectedProjectId } from "./current-project";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const projects = [
  { id: A, name: "Refonte du site", archived: false },
  { id: B, name: "Migration CRM", archived: false },
  { id: C, name: "Ancien projet", archived: true },
];

describe("projectIdFromPath", () => {
  it.each([
    [`/projets/${A}`, A],
    [`/projets/${A}/documents`, A],
    [`/projets/${A}/documents/${B}`, A],
    ["/projets", null],
    ["/projets/pas-un-uuid", null],
    ["/taches", null],
  ])("%s → %s", (path, expected) => {
    expect(projectIdFromPath(path)).toBe(expected);
  });
});

describe("resolveSelectedProjectId", () => {
  it("privilégie le projet de l'adresse", () => {
    expect(resolveSelectedProjectId({ pathname: `/projets/${A}/parametres`, rememberedId: B, projects })).toBe(A);
  });

  it("ailleurs, garde le dernier projet choisi, même archivé", () => {
    expect(resolveSelectedProjectId({ pathname: "/", rememberedId: C, projects })).toBe(C);
  });

  it("sinon, prend le premier projet actif par ordre alphabétique", () => {
    expect(resolveSelectedProjectId({ pathname: "/", rememberedId: null, projects })).toBe(B);
  });

  it("ignore un projet mémorisé ou une adresse qui n'existe plus", () => {
    const unknown = "44444444-4444-4444-8444-444444444444";
    expect(resolveSelectedProjectId({ pathname: `/projets/${unknown}`, rememberedId: unknown, projects })).toBe(B);
  });

  it("aucun projet : null", () => {
    expect(resolveSelectedProjectId({ pathname: "/", rememberedId: A, projects: [] })).toBeNull();
  });
});

describe("projectSwitchHref", () => {
  it.each([
    [`/projets/${A}`, `/projets/${B}`],
    [`/projets/${A}/documents`, `/projets/${B}/documents`],
    [`/projets/${A}/documents/${C}`, `/projets/${B}/documents`],
    [`/projets/${A}/parametres`, `/projets/${B}/parametres`],
    [`/projets/${A}/discord`, `/projets/${B}/discord`],
    [`/projets/${A}/tableau-de-bord`, `/projets/${B}/tableau-de-bord`],
    [`/projets/${A}/calendrier`, `/projets/${B}/calendrier`],
    [`/projets/${A}/calendrier/journees`, `/projets/${B}/calendrier/journees`],
    [`/projets/${A}/temps`, `/projets/${B}/temps`],
  ])("depuis %s → %s", (from, expected) => {
    expect(projectSwitchHref(from, B)).toBe(expected);
  });

  it.each(["/", "/projets", "/membres"])("sur %s, on reste sur la page", (from) => {
    expect(projectSwitchHref(from, B)).toBeNull();
  });
});
