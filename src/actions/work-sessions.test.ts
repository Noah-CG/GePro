import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { workSessions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatClock, formatDuration } from "@/lib/dates";
import { getWorkByProject, getWorkSessions, getWorkSummary } from "@/lib/queries";
import { getSelectedProjectId } from "@/lib/selected-project";
import { insertProject, insertUser, resetDb } from "@/test/db";
import { startWorkTimer, stopWorkTimer } from "./work-sessions";

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

  it("arrêter sans chrono en cours ne fait rien", async () => {
    await stopWorkTimer();
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

describe("affichage des durées", () => {
  it.each([
    [42_000, "42 s"],
    [12 * 60_000, "12 min"],
    [185 * 60_000, "3 h 05"],
  ])("formatDuration(%i) = %s", (ms, expected) => expect(formatDuration(ms)).toBe(expected));

  it("formatClock", () => expect(formatClock((4 * 60 + 9) * 1000)).toBe("0:04:09"));
});
