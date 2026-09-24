import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { taskAssignees, tasks, workSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatClock, formatDuration } from "@/lib/dates";
import { getProjectTeamWork, getTasks, getWorkByProject, getWorkSessions, getWorkSummary } from "@/lib/queries";
import { getSelectedProjectId } from "@/lib/selected-project";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { createWorkSession, deleteWorkSession, saveWorkNote, startWorkTimer, stopWorkTimer, updateWorkSession } from "./work-sessions";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/selected-project", () => ({ getSelectedProjectId: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let me: Awaited<ReturnType<typeof insertUser>>;
let projectId: string;

beforeEach(async () => {
  await resetDb(db);
  me = await insertUser(db);
  projectId = (await insertProject(db)).id;
  vi.mocked(requireUser).mockResolvedValue({ ...me, role: "member" });
  vi.mocked(getSelectedProjectId).mockResolvedValue(projectId);
});

const rows = () => db.select().from(workSessions).where(eq(workSessions.userId, me.id));

/** Période terminée de `minutes`, démarrée à l'instant ISO `start`. */
async function insertSession(start: string, minutes: number, project: string | null = projectId) {
  const startedAt = new Date(start);
  await db
    .insert(workSessions)
    .values({ userId: me.id, projectId: project, startedAt, endedAt: new Date(startedAt.getTime() + minutes * 60_000) });
}

describe("chrono", () => {
  it("démarrer puis arrêter enregistre une période sur le projet sélectionné", async () => {
    await startWorkTimer();
    let [row] = await rows();
    expect(row).toMatchObject({ projectId, endedAt: null });

    await stopWorkTimer();
    [row] = await rows();
    expect(row.endedAt).not.toBeNull();
    expect(row.endedAt!.getTime()).toBeGreaterThanOrEqual(row.startedAt.getTime());
  });

  it("un second démarrage pendant que le chrono tourne est sans effet", async () => {
    await startWorkTimer();
    await startWorkTimer();
    expect(await rows()).toHaveLength(1);
  });

  it("arrêter renvoie la période enregistrée, pour en rédiger le journal", async () => {
    await startWorkTimer();
    const res = await stopWorkTimer();
    const [row] = await rows();
    expect(res).toEqual({ ok: true, data: { id: row.id, durationMs: row.endedAt!.getTime() - row.startedAt.getTime() } });
  });

  it("arrêter sans chrono en cours ne fait rien", async () => {
    expect(await stopWorkTimer()).toEqual({ ok: true, data: null });
    expect(await rows()).toHaveLength(0);
  });

  it("n'arrête que le chrono du membre connecté", async () => {
    const other = await insertUser(db, "Léa Dubois");
    await db.insert(workSessions).values({ userId: other.id });
    await startWorkTimer();
    await stopWorkTimer();
    const [otherRow] = await db.select().from(workSessions).where(eq(workSessions.userId, other.id));
    expect(otherRow.endedAt).toBeNull();
  });
});

describe("journal de bord", () => {
  it("enregistre puis modifie le journal d'une période", async () => {
    await insertSession("2026-09-24T08:00:00Z", 60);
    const [{ id }] = await rows();

    expect(await saveWorkNote(id, "  Maquettes de l'accueil  ")).toEqual({ ok: true, data: undefined });
    expect((await getWorkSessions(me.id))[0].note).toBe("Maquettes de l'accueil");

    await saveWorkNote(id, "Maquettes + relecture");
    expect((await rows())[0].note).toBe("Maquettes + relecture");
  });

  it("on ne peut pas modifier le journal d'un autre membre", async () => {
    const other = await insertUser(db, "Léa Dubois");
    const [{ id }] = await db.insert(workSessions).values({ userId: other.id, endedAt: new Date() }).returning();
    expect(await saveWorkNote(id, "Piratage")).toEqual({ ok: false, error: "Session introuvable." });
    expect((await db.select().from(workSessions).where(eq(workSessions.id, id)))[0].note).toBe("");
  });

  it("refuse un journal trop long ou un identifiant invalide", async () => {
    await insertSession("2026-09-24T08:00:00Z", 60);
    const [{ id }] = await rows();
    expect((await saveWorkNote(id, "x".repeat(5001))).ok).toBe(false);
    expect(await saveWorkNote("pas-un-id", "Test")).toEqual({ ok: false, error: "Session introuvable." });
  });
});

describe("temps de travail", () => {
  // Jeudi 24 septembre 2026 ; la semaine commence le lundi 21.
  const today = "2026-09-24";

  it("cumule par jour, semaine et au total, dans le fuseau de l'équipe", async () => {
    await insertSession("2026-09-24T08:00:00Z", 90); // aujourd'hui
    await insertSession("2026-09-23T22:30:00Z", 30); // 00:30 à Paris : aujourd'hui aussi
    await insertSession("2026-09-21T09:00:00Z", 60); // lundi
    await insertSession("2026-09-20T09:00:00Z", 45); // dimanche précédent
    await db.insert(workSessions).values({ userId: me.id }); // en cours : exclu des cumuls

    const summary = await getWorkSummary(me.id, today);
    expect(summary).toMatchObject({ todayMs: 120 * 60_000, weekMs: 180 * 60_000, totalMs: 225 * 60_000, sessions: 4 });
    expect(summary.runningSince).not.toBeNull();
  });

  it("sans aucune période, tout est à zéro", async () => {
    expect(await getWorkSummary(me.id, today)).toEqual({ todayMs: 0, weekMs: 0, totalMs: 0, sessions: 0, runningSince: null });
  });

  it("répartit le temps par projet et liste les périodes récentes d'abord", async () => {
    const other = await insertProject(db, "Application mobile");
    await insertSession("2026-09-22T08:00:00Z", 30);
    await insertSession("2026-09-23T08:00:00Z", 120, other.id);
    await insertSession("2026-09-24T08:00:00Z", 15, null);

    expect(await getWorkByProject(me.id)).toEqual([
      { projectId: other.id, name: "Application mobile", color: other.color, ms: 120 * 60_000 },
      { projectId, name: "Refonte du site", color: expect.any(String), ms: 30 * 60_000 },
      { projectId: null, name: null, color: null, ms: 15 * 60_000 },
    ]);
    expect((await getWorkSessions(me.id)).map((s) => s.startedAt)).toEqual([
      "2026-09-24T08:00:00.000Z",
      "2026-09-23T08:00:00.000Z",
      "2026-09-22T08:00:00.000Z",
    ]);
  });
});

describe("tableau de bord", () => {
  it("temps de l'équipe sur le projet : cumul de la semaine et chronos en cours", async () => {
    const other = await insertUser(db, "Léa Dubois");
    const otherProject = await insertProject(db, "Application mobile");
    await insertSession("2026-09-22T08:00:00Z", 60);
    await insertSession("2026-09-14T08:00:00Z", 30); // semaine précédente : exclu
    await insertSession("2026-09-23T08:00:00Z", 45, otherProject.id); // autre projet : exclu
    const runningStart = new Date("2026-09-24T09:00:00Z");
    await db.insert(workSessions).values({ userId: other.id, projectId, startedAt: runningStart });

    const work = await getProjectTeamWork(projectId, "2026-09-24");
    expect(work).toHaveLength(2);
    expect(work.find((w) => w.userId === me.id)).toEqual({ userId: me.id, weekMs: 60 * 60_000, runningSince: null });
    expect(work.find((w) => w.userId === other.id)).toEqual({ userId: other.id, weekMs: 0, runningSince: runningStart.toISOString() });
  });

  it("« Mes tâches » ne renvoie que les tâches assignées au membre", async () => {
    const other = await insertUser(db, "Léa Dubois");
    const [mine, theirs, shared] = await db
      .insert(tasks)
      .values([{ projectId, title: "À moi" }, { projectId, title: "À Léa" }, { projectId, title: "Partagée" }])
      .returning({ id: tasks.id });
    await db.insert(taskAssignees).values([
      { taskId: mine.id, userId: me.id },
      { taskId: theirs.id, userId: other.id },
      { taskId: shared.id, userId: me.id },
      { taskId: shared.id, userId: other.id },
    ]);

    const result = await getTasks({ projectId, assigneeId: me.id });
    expect(result.map((t) => t.title).sort()).toEqual(["Partagée", "À moi"]);
    expect(result.find((t) => t.title === "Partagée")!.assigneeIds).toHaveLength(2);
  });
});

describe("affichage des durées", () => {
  it.each([
    [42_000, "42 s"],
    [12 * 60_000, "12 min"],
    [185 * 60_000, "3 h 05"],
  ])("formatDuration(%i) = %s", (ms, expected) => expect(formatDuration(ms)).toBe(expected));

  it("formatClock", () => expect(formatClock((4 * 60 + 9) * 1000)).toBe("0:04:09"));
});

describe("saisie manuelle du temps de travail", () => {
  const input = { date: "2026-09-21", start: "09:00", end: "12:30", projectId, note: "Maquettes" };
  const create = (patch: Partial<typeof input> = {}, userId = me.id) => createWorkSession(userId, { ...input, projectId, ...patch });

  it("ajoute une période, lue dans le fuseau de l'équipe", async () => {
    const res = await create();
    expect(res.ok).toBe(true);
    const [row] = await rows();
    expect(row).toMatchObject({ projectId, note: "Maquettes", startedAt: new Date("2026-09-21T07:00:00Z"), endedAt: new Date("2026-09-21T10:30:00Z") });
  });

  it("fait finir le lendemain une période dont la fin précède le début", async () => {
    await create({ start: "22:00", end: "01:30" });
    const [row] = await rows();
    expect(row.endedAt!.toISOString()).toBe("2026-09-21T23:30:00.000Z");
  });

  it.each([
    ["une heure invalide", { start: "25:00" }, "Heure invalide (ex. 09:30)"],
    ["une fin égale au début", { end: "09:00" }, "L'heure de fin doit être différente de l'heure de début."],
    ["une période dans le futur", { date: "2099-01-01" }, "Une période de travail ne peut pas se terminer dans le futur."],
    ["un projet inconnu", { projectId: "00000000-0000-4000-8000-000000000000" }, "Projet introuvable."],
  ])("refuse %s", async (_, patch, error) => {
    expect(await create(patch)).toEqual({ ok: false, error });
  });

  it("refuse une période qui en chevauche une autre", async () => {
    await insertSession("2026-09-21T08:00:00Z", 60); // 10:00 → 11:00, heure de Paris
    const res = await create();
    expect(res).toEqual({ ok: false, error: "Cette période chevauche une autre période de travail (21 sept. 2026 à 10:00 → 11:00)." });
  });

  it("corrige une période, et arrête un chrono oublié", async () => {
    await startWorkTimer();
    const [running] = await rows();
    const res = await updateWorkSession(running.id, { ...input, projectId });
    expect(res.ok).toBe(true);
    const [row] = await rows();
    expect(row).toMatchObject({ id: running.id, endedAt: new Date("2026-09-21T10:30:00Z"), note: "Maquettes" });
  });

  it("une correction ne se compte pas elle-même comme chevauchement", async () => {
    await create();
    const [row] = await rows();
    expect((await updateWorkSession(row.id, { ...input, projectId, end: "13:00" })).ok).toBe(true);
  });

  it("supprime une période", async () => {
    await create();
    const [row] = await rows();
    expect(await deleteWorkSession(row.id)).toEqual({ ok: true, data: undefined });
    expect(await rows()).toEqual([]);
  });

  it("interdit de toucher au temps d'un autre membre, sauf pour un administrateur", async () => {
    const other = await insertUser(db, "Léa Dubois");
    const forbidden = { ok: false, error: "Seul le membre concerné ou un administrateur peut modifier ce temps de travail." };
    expect(await create({}, other.id)).toEqual(forbidden);

    vi.mocked(requireUser).mockResolvedValue({ ...me, role: "admin" });
    const res = await create({}, other.id);
    expect(res.ok).toBe(true);
    const id = (res as { data: { id: string } }).data.id;

    vi.mocked(requireUser).mockResolvedValue({ ...me, role: "member" });
    expect(await updateWorkSession(id, { ...input, projectId })).toEqual(forbidden);
    expect(await deleteWorkSession(id)).toEqual(forbidden);
  });

  it("signale une période ou un membre inconnus", async () => {
    expect(await updateWorkSession("00000000-0000-4000-8000-000000000000", { ...input, projectId })).toEqual({ ok: false, error: "Période introuvable." });
    expect(await deleteWorkSession("pas-un-uuid")).toEqual({ ok: false, error: "Période introuvable." });
    vi.mocked(requireUser).mockResolvedValue({ ...me, role: "admin" });
    expect(await create({}, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "Membre introuvable." });
  });
});
