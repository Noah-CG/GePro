import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { projectEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { createEvent, deleteEvent, updateEvent } from "./events";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type User = Awaited<ReturnType<typeof insertUser>>;
let camille: User;
let lea: User;
let admin: User;
let projectId: string;

const actAs = (user: User, role: "admin" | "member" = "member") => vi.mocked(requireUser).mockResolvedValue({ ...user, role });

const input = { title: "Comité de pilotage", description: "Salle 2", eventDate: "2026-10-02", color: "#f43f5e" };
const DENIED = "Seul le créateur de l'événement ou un administrateur peut le modifier ou le supprimer.";

const findEvent = async (id: string) => (await db.select().from(projectEvents).where(eq(projectEvents.id, id)))[0];

/** Événement créé par Camille. */
async function camilleEvent() {
  actAs(camille);
  const res = await createEvent({ ...input, projectId });
  if (!res.ok) throw new Error(res.error);
  return res.data.id;
}

beforeEach(async () => {
  await resetDb(db);
  camille = await insertUser(db, "Camille Martin");
  lea = await insertUser(db, "Léa Dubois");
  admin = await insertUser(db, "Hugo Moreau");
  projectId = (await insertProject(db)).id;
});

describe("createEvent", () => {
  it("crée un événement rattaché au projet, au nom de l'utilisateur connecté", async () => {
    const id = await camilleEvent();
    expect(await findEvent(id)).toMatchObject({ ...input, projectId, createdBy: camille.id });
  });

  it("refuse un événement sans projet", async () => {
    actAs(lea);
    expect(await createEvent({ ...input, projectId: "" })).toEqual({ ok: false, error: "Choisissez un projet" });
    expect(await db.select().from(projectEvents)).toHaveLength(0);
  });

  it.each([
    ["titre vide", { title: "   " }, "Le titre est obligatoire"],
    ["date absente", { eventDate: "" }, "Choisissez une date"],
    ["date inexistante", { eventDate: "2026-09-31" }, "Date invalide"],
    ["couleur invalide", { color: "rouge" }, "Couleur invalide"],
  ])("refuse une saisie invalide : %s", async (_, patch, error) => {
    actAs(camille);
    expect(await createEvent({ ...input, projectId, ...patch })).toEqual({ ok: false, error });
    expect(await db.select().from(projectEvents)).toHaveLength(0);
  });

  it("refuse un projet inexistant", async () => {
    actAs(camille);
    expect(await createEvent({ ...input, projectId: "00000000-0000-4000-8000-000000000000" })).toEqual({
      ok: false,
      error: "Projet introuvable.",
    });
  });
});

describe("updateEvent", () => {
  it("le créateur peut modifier son événement", async () => {
    const id = await camilleEvent();
    expect(await updateEvent(id, { ...input, projectId, title: "Comité reporté", eventDate: "2026-10-09" })).toEqual({ ok: true, data: undefined });
    expect(await findEvent(id)).toMatchObject({ title: "Comité reporté", eventDate: "2026-10-09" });
  });

  it("un autre membre ne peut pas le modifier", async () => {
    const id = await camilleEvent();
    actAs(lea);
    expect(await updateEvent(id, { ...input, projectId, title: "Piraté" })).toEqual({ ok: false, error: DENIED });
    expect((await findEvent(id)).title).toBe("Comité de pilotage");
  });

  it("un admin peut modifier l'événement d'un autre", async () => {
    const id = await camilleEvent();
    actAs(admin, "admin");
    expect(await updateEvent(id, { ...input, projectId, title: "Corrigé par l'admin" })).toEqual({ ok: true, data: undefined });
    expect((await findEvent(id)).title).toBe("Corrigé par l'admin");
  });

  it("événement introuvable", async () => {
    actAs(admin, "admin");
    expect(await updateEvent("00000000-0000-4000-8000-000000000000", { ...input, projectId })).toEqual({ ok: false, error: "Événement introuvable." });
    expect(await updateEvent("pas-un-id", { ...input, projectId })).toEqual({ ok: false, error: "Événement introuvable." });
  });
});

describe("deleteEvent", () => {
  it("le créateur peut supprimer son événement", async () => {
    const id = await camilleEvent();
    expect(await deleteEvent(id)).toEqual({ ok: true, data: undefined });
    expect(await findEvent(id)).toBeUndefined();
  });

  it("un autre membre ne peut pas le supprimer", async () => {
    const id = await camilleEvent();
    actAs(lea);
    expect(await deleteEvent(id)).toEqual({ ok: false, error: DENIED });
    expect(await findEvent(id)).toBeDefined();
  });

  it("un admin peut supprimer l'événement d'un autre", async () => {
    const id = await camilleEvent();
    actAs(admin, "admin");
    expect(await deleteEvent(id)).toEqual({ ok: true, data: undefined });
    expect(await findEvent(id)).toBeUndefined();
  });
});
