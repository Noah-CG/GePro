import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { workSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import { GET } from "./route";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

let me: Awaited<ReturnType<typeof insertUser>>;
let other: Awaited<ReturnType<typeof insertUser>>;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  me = await insertUser(db, "Camille Martin");
  other = await insertUser(db, "Léa Dubois");
  projectId = (await insertProject(db, "Refonte du site", me.id)).id;
  await addMember(db, projectId, other.id);
  vi.mocked(getCurrentUser).mockResolvedValue({ ...me, role: "member" });
});

const as = (user: typeof me) => vi.mocked(getCurrentUser).mockResolvedValue({ ...user, role: "member" });
const ctx = (id = projectId) => ({ params: Promise.resolve({ id }) });
const get = (query = "", id = projectId) => GET(new NextRequest(`http://localhost/api/projects/${id}/journal${query}`), ctx(id));

/** Période d'une heure démarrée à `start` (ISO, UTC), avec son compte rendu. */
async function entry(userId: string, start: string, note: string, project = projectId) {
  const startedAt = new Date(start);
  await db.insert(workSessions).values({ userId, projectId: project, startedAt, endedAt: new Date(startedAt.getTime() + 3_600_000), note });
}

/** Texte du PDF, page par page puis ligne par ligne. */
async function pdfLines(res: Response): Promise<string[]> {
  const pdf = await getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const { items } = await (await pdf.getPage(i)).getTextContent();
    for (const item of items) if ("str" in item && item.str.trim()) lines.push(item.str);
  }
  return lines;
}

describe("export PDF du journal de bord", () => {
  it("exige une session et l'appartenance au projet (404 sinon, comme un projet inexistant)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await get()).status).toBe(401);

    as(await insertUser(db, "Hugo Petit"));
    expect((await get()).status).toBe(404);
    expect((await get("", "pas-un-uuid")).status).toBe(404);
  });

  it("mes entrées : date, heure et auteur, puis le texte, dans l'ordre chronologique", async () => {
    await entry(me.id, "2026-09-10T12:00:00Z", "Maquette de la page d'accueil\nValidée avec le client ✅");
    await entry(me.id, "2026-09-02T07:30:00Z", "Réunion de lancement « kick-off »");
    await entry(me.id, "2026-09-03T08:00:00Z", "   "); // rien de rédigé : absent
    await entry(other.id, "2026-09-04T08:00:00Z", "Entrée de Léa");
    await entry(me.id, "2026-09-05T08:00:00Z", "Autre projet", (await insertProject(db, "Autre", me.id)).id);

    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const lines = await pdfLines(res);
    const body = lines.join("\n");
    expect(body).toContain("Journal de bord · Refonte du site");
    expect(body).toContain("Camille Martin · Depuis le début · 2 entrées");
    // Heures dans le fuseau de l'équipe (Europe/Paris : UTC+2 en septembre).
    const first = lines.indexOf("mercredi 2 septembre 2026 · 09:30 – 10:30 · Camille Martin");
    const second = lines.indexOf("jeudi 10 septembre 2026 · 14:00 – 15:00 · Camille Martin");
    expect(first).toBeGreaterThan(-1);
    expect(lines[first + 1]).toBe("Réunion de lancement « kick-off »");
    expect(second).toBeGreaterThan(first);
    expect(lines.slice(second + 1, second + 3)).toEqual(["Maquette de la page d'accueil", "Validée avec le client ?"]);
    expect(body).not.toContain("Léa");
    expect(body).not.toContain("Autre projet");
  });

  it("entre deux dates (incluses)", async () => {
    await entry(me.id, "2026-09-01T10:00:00Z", "Avant");
    await entry(me.id, "2026-09-02T21:30:00Z", "Premier jour, 23 h 30 à Paris");
    await entry(me.id, "2026-09-05T10:00:00Z", "Dernier jour");
    await entry(me.id, "2026-09-05T22:30:00Z", "Après (6 septembre à Paris)");

    const body = (await pdfLines(await get("?du=2026-09-02&au=2026-09-05"))).join("\n");
    expect(body).toContain("Du 2 sept. 2026 au 5 sept. 2026 · 2 entrées");
    expect(body).toContain("Premier jour");
    expect(body).toContain("Dernier jour");
    expect(body).not.toContain("Avant");
    expect(body).not.toContain("Après");

    expect((await get("?du=2026-09-05&au=2026-09-02")).status).toBe(400);
    expect((await get("?du=2026-02-30")).status).toBe(400);
  });

  it("un autre membre ou toute l'équipe : propriétaire et administrateurs seulement", async () => {
    await entry(me.id, "2026-09-02T08:00:00Z", "Entrée de Camille");
    await entry(other.id, "2026-09-03T08:00:00Z", "Entrée de Léa");

    const lea = (await pdfLines(await get(`?membre=${other.id}`))).join("\n");
    expect(lea).toContain("Entrée de Léa");
    expect(lea).not.toContain("Entrée de Camille");

    const team = (await pdfLines(await get("?membre=tous"))).join("\n");
    expect(team).toContain("Toute l'équipe · Depuis le début · 2 entrées");
    expect(team).toMatch(/Camille Martin\nEntrée de Camille[\s\S]*Léa Dubois\nEntrée de Léa/);

    // Membre extérieur au projet : introuvable.
    expect((await get(`?membre=${(await insertUser(db, "Hugo Petit")).id}`)).status).toBe(404);

    // Simple membre : ses propres entrées seulement.
    as(other);
    expect((await get(`?membre=${me.id}`)).status).toBe(403);
    expect((await get("?membre=tous")).status).toBe(403);
    expect((await pdfLines(await get(`?membre=${other.id}`))).join("\n")).toContain("Entrée de Léa");
  });

  it("aucune entrée : un PDF qui le dit", async () => {
    expect((await pdfLines(await get())).join("\n")).toContain("Aucune entrée rédigée sur cette période.");
  });
});
