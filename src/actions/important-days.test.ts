import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { importantDays } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCalendarItems, getImportantDays } from "@/lib/queries";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { removeImportantDay, saveImportantDay } from "./important-days";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const me = await insertUser(db);
  projectId = (await insertProject(db)).id;
  vi.mocked(requireUser).mockResolvedValue({ ...me, role: "member" });
});

async function add(date: string, title = "Lancement", extra: { color?: string; project?: string } = {}) {
  const res = await saveImportantDay(null, { projectId: extra.project ?? projectId, date, title, color: extra.color });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

describe("journées importantes", () => {
  it("crée une journée rouge par défaut, sans décalage de date", async () => {
    await add("2026-03-12", "Salon");
    const [day] = await db.select().from(importantDays);
    expect(day).toMatchObject({ date: "2026-03-12", title: "Salon", color: "#dc2626", description: "" });
  });

  it("n'accepte qu'une journée par date et par projet", async () => {
    await add("2026-03-12");
    await expect(saveImportantDay(null, { projectId, date: "2026-03-12", title: "Autre" })).resolves.toMatchObject({ ok: false });
    // Un autre projet peut marquer la même date.
    const other = (await insertProject(db, "Autre projet")).id;
    await expect(saveImportantDay(null, { projectId: other, date: "2026-03-12", title: "Autre" })).resolves.toMatchObject({ ok: true });
  });

  it("modifie puis retire une journée", async () => {
    const id = await add("2026-03-12");
    await expect(saveImportantDay(id, { projectId, date: "2026-03-12", title: "Lancement v2", color: "#2563eb" })).resolves.toMatchObject({ ok: true });
    expect((await getImportantDays(projectId))[0]).toMatchObject({ title: "Lancement v2", color: "#2563eb" });
    await expect(removeImportantDay(id)).resolves.toMatchObject({ ok: true });
    expect(await getImportantDays(projectId)).toEqual([]);
  });

  it("refuse un titre vide ou trop long, une date ou une couleur invalides", async () => {
    const base = { projectId, date: "2026-03-12", title: "Ok" };
    await expect(saveImportantDay(null, { ...base, title: "  " })).resolves.toMatchObject({ ok: false });
    await expect(saveImportantDay(null, { ...base, title: "x".repeat(61) })).resolves.toMatchObject({ ok: false });
    await expect(saveImportantDay(null, { ...base, date: "2026-02-30" })).resolves.toMatchObject({ ok: false });
    await expect(saveImportantDay(null, { ...base, color: "#123456" })).resolves.toMatchObject({ ok: false });
  });

  it("liste les journées à venir par date, et celles de la période du calendrier", async () => {
    await add("2026-04-01", "Plus tard");
    await add("2026-03-12", "Bientôt");
    await add("2026-02-01", "Passée");
    expect((await getImportantDays(projectId, { from: "2026-03-01", limit: 5 })).map((d) => d.title)).toEqual(["Bientôt", "Plus tard"]);
    const { importantDays: inRange } = await getCalendarItems({ from: "2026-03-01", to: "2026-03-31", projectId });
    expect(inRange.map((d) => d.date)).toEqual(["2026-03-12"]);
  });
});
