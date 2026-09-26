import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addMember, insertProject, insertUser, resetDb } from "@/test/db";
import { atLeast, authorizeProject, authorizeProjectOf, getProjectRole, requireProjectAccess } from "./access";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

type User = Awaited<ReturnType<typeof insertUser>>;
let alice: User;
let bob: User;
let projectId: string;

const actAs = (user: User, role: "admin" | "member" = "member") => vi.mocked(requireUser).mockResolvedValue({ ...user, role });
const MISSING = "00000000-0000-4000-8000-000000000000";

beforeEach(async () => {
  await resetDb(db);
  alice = await insertUser(db, "Alice");
  bob = await insertUser(db, "Bob");
  projectId = (await insertProject(db, "Projet d'Alice", alice.id)).id;
});

describe("atLeast", () => {
  it("ordonne les rôles owner > admin > member", () => {
    expect(atLeast("owner", "admin")).toBe(true);
    expect(atLeast("admin", "admin")).toBe(true);
    expect(atLeast("member", "admin")).toBe(false);
    expect(atLeast("admin", "owner")).toBe(false);
  });
});

describe("getProjectRole", () => {
  it("rôle du membre, null pour un non-membre, un projet inexistant ou un id invalide", async () => {
    expect(await getProjectRole(alice.id, projectId)).toBe("owner");
    expect(await getProjectRole(bob.id, projectId)).toBeNull();
    expect(await getProjectRole(alice.id, MISSING)).toBeNull();
    expect(await getProjectRole(alice.id, "pas-un-id")).toBeNull();
    expect(await getProjectRole(alice.id, 42)).toBeNull();
  });
});

describe("authorizeProject", () => {
  it("non-membre : même réponse que pour un projet inexistant", async () => {
    actAs(bob);
    const denied = await authorizeProject(projectId);
    expect(denied).toEqual({ ok: false, error: "Projet introuvable." });
    expect(await authorizeProject(MISSING)).toEqual(denied);
  });

  it("le rôle global admin ne donne aucun accès aux projets", async () => {
    actAs(bob, "admin");
    expect(await authorizeProject(projectId)).toEqual({ ok: false, error: "Projet introuvable." });
  });

  it("membre : accès au contenu, pas aux réglages réservés", async () => {
    await addMember(db, projectId, bob.id);
    actAs(bob);
    expect(await authorizeProject(projectId)).toMatchObject({ ok: true, access: { projectId, role: "member" } });
    expect(await authorizeProject(projectId, "admin")).toEqual({
      ok: false,
      error: "Seuls le propriétaire et les administrateurs du projet peuvent faire cela.",
    });
    expect(await authorizeProject(projectId, "owner")).toEqual({ ok: false, error: "Seul le propriétaire du projet peut faire cela." });
  });
});

describe("authorizeProjectOf", () => {
  it("un objet d'un projet dont on n'est pas membre est « introuvable », comme un objet inexistant", async () => {
    const [task] = await db.insert(tasks).values({ projectId, title: "Secrète" }).returning();
    actAs(bob);
    expect(await authorizeProjectOf("task", task.id)).toEqual({ ok: false, error: "Tâche introuvable." });
    expect(await authorizeProjectOf("task", MISSING)).toEqual({ ok: false, error: "Tâche introuvable." });

    actAs(alice);
    expect(await authorizeProjectOf("task", task.id)).toMatchObject({ ok: true, access: { projectId, role: "owner" } });
  });
});

describe("requireProjectAccess", () => {
  it("404 pour un non-membre", async () => {
    actAs(bob);
    await expect(requireProjectAccess(projectId)).rejects.toThrow("NEXT_NOT_FOUND");
    actAs(alice);
    await expect(requireProjectAccess(projectId)).resolves.toMatchObject({ projectId, role: "owner" });
  });
});
