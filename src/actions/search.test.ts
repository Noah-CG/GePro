import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { search } from "./search";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));

let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  const user = await insertUser(db);
  vi.mocked(requireUser).mockResolvedValue({ ...user, role: "member" });
  projectId = (await insertProject(db, "Équipe événementielle", user.id)).id;
  await db.insert(tasks).values([
    { projectId, title: "Rédiger l'Édito du premier numéro", position: 1024, createdBy: user.id },
    { projectId, title: "Remise à 100_% des tarifs", position: 2048, createdBy: user.id },
  ]);
});

const titles = async (q: string) => (await search(q, projectId)).tasks.map((t) => t.title);

describe("search", () => {
  it("ignore les accents et la casse, dans la saisie comme dans les titres", async () => {
    expect(await titles("edito")).toEqual(["Rédiger l'Édito du premier numéro"]);
    expect(await titles("RÉDIGER")).toEqual(["Rédiger l'Édito du premier numéro"]);
    expect((await search("equipe evenementielle", projectId)).projects.map((p) => p.name)).toEqual(["Équipe événementielle"]);
  });

  it("traite % et _ comme du texte, pas comme des jokers", async () => {
    expect(await titles("100_%")).toEqual(["Remise à 100_% des tarifs"]);
    expect(await titles("r_diger")).toEqual([]);
  });
});
