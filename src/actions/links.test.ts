import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectLinks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getProjectLinks } from "@/lib/queries";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { createProjectLink, deleteProjectLink, updateProjectLink } from "./links";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let projectId: string;
let meId: string;

beforeEach(async () => {
  await resetDb(db);
  const me = await insertUser(db);
  meId = me.id;
  projectId = (await insertProject(db)).id;
  vi.mocked(requireUser).mockResolvedValue({ ...me, role: "member" });
});

async function add(url: string, title = "", project = projectId) {
  const res = await createProjectLink(project, { url, title });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

describe("liens utiles", () => {
  it("normalise l'adresse et complète le titre (service reconnu, sinon domaine)", async () => {
    await add("github.com/gepro/gepro");
    await add("https://www.exemple.fr/doc");
    await add("https://www.figma.com/file/1", "  Maquettes  ");
    expect((await getProjectLinks()).map(({ url, title }) => ({ url, title }))).toEqual([
      { url: "https://github.com/gepro/gepro", title: "GitHub" },
      { url: "https://www.exemple.fr/doc", title: "exemple.fr" },
      { url: "https://www.figma.com/file/1", title: "Maquettes" },
    ]);
    const [row] = await db.select().from(projectLinks).limit(1);
    expect(row.createdBy).toBe(meId);
  });

  it("ajoute chaque lien à la fin de la liste de son projet", async () => {
    await add("https://a.fr");
    await add("https://b.fr");
    const other = (await insertProject(db, "Autre projet")).id;
    await add("https://c.fr", "", other);
    const rows = await db.select({ title: projectLinks.title, position: projectLinks.position }).from(projectLinks);
    expect(rows.sort((x, y) => x.title.localeCompare(y.title))).toEqual([
      { title: "a.fr", position: 0 },
      { title: "b.fr", position: 1 },
      { title: "c.fr", position: 0 },
    ]);
  });

  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "mailto:camille@exemple.fr", "ftp://exemple.fr", "  ", "https://x@exemple.fr"])(
    "refuse l'adresse %j",
    async (url) => {
      await expect(createProjectLink(projectId, { url, title: "Piège" })).resolves.toMatchObject({ ok: false });
      expect(await getProjectLinks()).toEqual([]);
    },
  );

  it("refuse un titre trop long et un projet inconnu", async () => {
    await expect(createProjectLink(projectId, { url: "https://a.fr", title: "x".repeat(121) })).resolves.toMatchObject({ ok: false });
    await expect(createProjectLink("00000000-0000-4000-8000-000000000000", { url: "https://a.fr" })).resolves.toMatchObject({
      ok: false,
      error: "Projet introuvable.",
    });
    await expect(createProjectLink("pas-un-uuid", { url: "https://a.fr" })).resolves.toMatchObject({ ok: false });
  });

  it("modifie un lien, sans accepter d'adresse dangereuse", async () => {
    const id = await add("https://a.fr");
    await expect(updateProjectLink(id, { url: "docs.google.com/spreadsheets/d/1", title: "" })).resolves.toMatchObject({ ok: true });
    expect((await getProjectLinks())[0]).toMatchObject({ url: "https://docs.google.com/spreadsheets/d/1", title: "Google Sheets" });
    await expect(updateProjectLink(id, { url: "javascript:alert(1)" })).resolves.toMatchObject({ ok: false });
    expect((await getProjectLinks())[0].url).toBe("https://docs.google.com/spreadsheets/d/1");
  });

  it("supprime un lien", async () => {
    const id = await add("https://a.fr");
    await expect(deleteProjectLink(id)).resolves.toMatchObject({ ok: true });
    expect(await getProjectLinks()).toEqual([]);
    await expect(deleteProjectLink(id)).resolves.toMatchObject({ ok: false, error: "Lien introuvable." });
  });

  it("exige d'être connecté", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(createProjectLink(projectId, { url: "https://a.fr" })).rejects.toThrow("NEXT_REDIRECT");
  });
});
