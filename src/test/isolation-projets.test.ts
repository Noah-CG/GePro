/**
 * Étanchéité des projets, de bout en bout : deux comptes A et B, les pages, les routes API et les
 * Server Actions réelles, sur une base PGlite avec les vraies migrations.
 *
 * 1. Un projet créé par A est vierge, et A en est le seul membre (owner).
 * 2. B ne voit pas le projet de A (liste, sélecteur, recherche, équipe).
 * 3. B reçoit une 404 sur chaque page et chaque route API du projet de A.
 * 4. B ne peut rien créer, modifier ni supprimer dans le projet de A, même en forgeant la requête.
 * 5. A invite B, B accepte : B voit le projet et ses données, avec le rôle member.
 * 6. Un deuxième projet de A n'affiche aucune donnée du premier.
 * 7. Supprimer un projet supprime toutes ses données, et rien d'autre.
 */
import { asc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInvitation, inviteMember, leaveProject, removeMember, setMemberRole, transferOwnership } from "@/actions/project-members";
import { saveCalendarSync } from "@/actions/calendar-sync";
import { linkDiscordChannel, unlinkDiscordChannel } from "@/actions/discord";
import { createEvent, deleteEvent, updateEvent } from "@/actions/events";
import { cancelFileUpload, deleteFile, finishFileUpload, startFileUpload } from "@/actions/files";
import { removeImportantDay, saveImportantDay } from "@/actions/important-days";
import { attachGoogleDoc, detachResource, refreshProjectResources } from "@/actions/integrations";
import { createProject, deleteProject, setProjectArchived, updateProject } from "@/actions/projects";
import { search } from "@/actions/search";
import { createTask, deleteTask, getTaskOptions, moveTask, setTaskDates, setTaskParent, updateTask } from "@/actions/tasks";
import { createWorkSession, startWorkTimer } from "@/actions/work-sessions";
import { GET as getFile } from "@/app/api/fichiers/[id]/route";
import { GET as getDiscordMessages, POST as postDiscordMessage } from "@/app/api/projects/[id]/discord/messages/route";
import { POST as postDiscordRead } from "@/app/api/projects/[id]/discord/read/route";
import { GET as getDiscordStatus } from "@/app/api/projects/[id]/discord/status/route";
import CalendarRedirect from "@/app/(app)/calendrier/page";
import ProjectPage, { generateMetadata as projectMetadata } from "@/app/(app)/projets/[id]/page";
import ImportantDaysPage from "@/app/(app)/projets/[id]/calendrier/journees/page";
import CalendarPage from "@/app/(app)/projets/[id]/calendrier/page";
import DiscordPage from "@/app/(app)/projets/[id]/discord/page";
import DocumentPage from "@/app/(app)/projets/[id]/documents/[docId]/page";
import DocumentsPage from "@/app/(app)/projets/[id]/documents/page";
import PdfPage from "@/app/(app)/projets/[id]/documents/pdf/[fileId]/page";
import SettingsPage from "@/app/(app)/projets/[id]/parametres/page";
import DashboardPage from "@/app/(app)/projets/[id]/tableau-de-bord/page";
import TimePage from "@/app/(app)/projets/[id]/temps/page";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { getDiscordChannelViews } from "@/lib/discord/service";
import {
  getCalendarItems,
  getFileLinks,
  getImportantDays,
  getProjectFiles,
  getProjectOptions,
  getProjectResources,
  getProjectsWithStats,
  getResourceLinks,
  getTasks,
  getTeam,
} from "@/lib/queries";
import { insertUser, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
// Cookie « projet sélectionné » : B y a mis l'id du projet de A.
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined) }),
}));
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

type User = Awaited<ReturnType<typeof insertUser>>;
let A: User;
let B: User;

function actAs(user: User) {
  vi.mocked(requireUser).mockResolvedValue({ ...user, role: "member" });
  vi.mocked(getCurrentUser).mockResolvedValue({ ...user, role: "member" });
}

/** Résultat d'une Server Action qui doit réussir. */
function must<T>(res: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

const PROJECT_TABLES = [
  schema.projects,
  schema.projectMembers,
  schema.projectInvitations,
  schema.tasks,
  schema.taskAssignees,
  schema.taskDependencies,
  schema.projectEvents,
  schema.importantDays,
  schema.externalResources,
  schema.projectFiles,
  schema.projectFileChunks,
  schema.projectDiscord,
  schema.googleCalendarSyncProjects,
  schema.workSessions,
] as const;

/** Contenu de toutes les tables de données projet : doit rester identique après une tentative refusée. */
async function snapshot() {
  const rows = await Promise.all(PROJECT_TABLES.map((t) => db.select().from(t)));
  return JSON.stringify(rows.map((r) => r.map((row) => JSON.stringify(row)).sort()));
}

/** Projet de A, rempli par A avec les vraies actions, plus ce qui n'a pas d'action simple (fichier, document, Discord). */
async function projectOfA(name = "Projet secret de A") {
  actAs(A);
  const { id: projectId } = must(await createProject({ name, description: "Confidentiel", color: "#6366f1" }));
  const { id: taskId } = must(await createTask({ projectId, title: "Tâche secrète", dueDate: "2026-10-05", assigneeIds: [A.id] }));
  const { id: subtaskId } = must(await createTask({ projectId, title: "Sous-tâche secrète", parentId: taskId, dependsOnIds: [] }));
  const { id: eventId } = must(await createEvent({ projectId, title: "Réunion secrète", eventDate: "2026-10-06", color: "#f43f5e" }));
  const { id: dayId } = must(await saveImportantDay(null, { projectId, date: "2026-10-07", title: "Lancement secret" }));

  const [file] = await db
    .insert(schema.projectFiles)
    .values({ projectId, name: "secret.pdf", size: 9, chunkCount: 1, status: "ready", uploadedBy: A.id })
    .returning();
  await db.insert(schema.projectFileChunks).values({ fileId: file.id, position: 0, data: new TextEncoder().encode("%PDF-1.7\n") });
  const [resource] = await db
    .insert(schema.externalResources)
    .values({ projectId, provider: "google", kind: "google_doc", externalId: "doc-secret", title: "Doc secret", url: "https://docs.google.com/x", attachedBy: A.id })
    .returning();
  await db
    .insert(schema.projectDiscord)
    .values({ projectId, guildId: "1", channelId: "2", channelName: "secret", webhookId: "3", webhookTokenEnc: "x", linkedBy: A.id });
  await db.insert(schema.workSessions).values({ userId: A.id, projectId, startedAt: new Date("2026-09-20T08:00:00Z"), endedAt: new Date("2026-09-20T09:00:00Z") });
  return { projectId, taskId, subtaskId, eventId, dayId, fileId: file.id, resourceId: resource.id };
}

beforeEach(async () => {
  await resetDb(db);
  cookieJar.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  A = await insertUser(db, "Alice A");
  B = await insertUser(db, "Bob B");
});

describe("1. un nouveau projet est vierge, son créateur en est le seul membre", () => {
  it("rien d'un autre projet, aucune donnée, A owner et seul membre", async () => {
    await projectOfA("Premier projet");
    actAs(A);
    const { id } = must(await createProject({ name: "Nouveau projet", color: "#10b981" }));

    expect(await db.select().from(schema.projectMembers).where(eq(schema.projectMembers.projectId, id))).toEqual([
      expect.objectContaining({ projectId: id, userId: A.id, role: "owner" }),
    ]);
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
    expect(project).toMatchObject({ ownerId: A.id, createdBy: A.id });

    for (const table of [schema.tasks, schema.projectEvents, schema.importantDays, schema.externalResources, schema.projectFiles, schema.projectInvitations]) {
      expect(await db.select().from(table).where(eq(table.projectId, id))).toEqual([]);
    }
    expect(await db.select().from(schema.projectDiscord).where(eq(schema.projectDiscord.projectId, id))).toEqual([]);
    expect(await getTasks({ projectId: id })).toEqual([]);
    expect(await getCalendarItems({ from: "2026-01-01", to: "2026-12-31", projectId: id })).toEqual({ tasks: [], events: [], importantDays: [] });
  });
});

describe("2. B ne voit pas le projet de A", () => {
  it("ni dans ses listes, ni dans la recherche, ni dans l'équipe", async () => {
    const a = await projectOfA();
    actAs(B);
    expect(await getProjectsWithStats(B.id)).toEqual([]);
    expect(await getProjectsWithStats(B.id, { id: a.projectId })).toEqual([]);
    expect(await getProjectOptions(B.id)).toEqual([]);
    expect(await getTasks({ viewerId: B.id })).toEqual([]);
    expect(await getResourceLinks(B.id)).toEqual([]);
    expect(await getFileLinks(B.id)).toEqual([]);
    expect(await getDiscordChannelViews(B.id)).toEqual({});
    expect(await getTeam(B.id)).toEqual([]);
    expect(await search("secret", a.projectId)).toEqual({ projects: [], tasks: [] });
    expect(await getTaskOptions(a.projectId)).toEqual([]);
  });

  it("un cookie « projet sélectionné » pointant sur le projet de A ne donne rien", async () => {
    const a = await projectOfA();
    cookieJar.set("gepro_projet", a.projectId);
    actAs(B);
    await expect(CalendarRedirect({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /projets");
  });
});

describe("3. B reçoit une 404 sur le projet de A", () => {
  it("chaque page du projet, métadonnées comprises", async () => {
    const a = await projectOfA();
    const params = Promise.resolve({ id: a.projectId });
    const searchParams = Promise.resolve({});
    actAs(B);
    const pages = [
      () => ProjectPage({ params }),
      () => projectMetadata({ params }),
      () => DashboardPage({ params, searchParams }),
      () => CalendarPage({ params, searchParams }),
      () => ImportantDaysPage({ params }),
      () => TimePage({ params, searchParams }),
      () => DocumentsPage({ params }),
      () => SettingsPage({ params, searchParams }),
      () => DiscordPage({ params }),
      () => DocumentPage({ params: Promise.resolve({ id: a.projectId, docId: a.resourceId }) }),
      () => PdfPage({ params: Promise.resolve({ id: a.projectId, fileId: a.fileId }) }),
    ];
    for (const page of pages) await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");

    // Même réponse pour un projet qui n'existe pas.
    await expect(ProjectPage({ params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    // A, lui, ouvre chacune de ces pages : la 404 de B tient bien à l'appartenance.
    actAs(A);
    for (const page of pages) await expect(page()).resolves.toBeTruthy();
  });

  it("chaque route API : fichier PDF, messages, statut et lecture Discord", async () => {
    const a = await projectOfA();
    actAs(B);
    const fileRes = await getFile(new NextRequest(`http://localhost/api/fichiers/${a.fileId}`), { params: Promise.resolve({ id: a.fileId }) });
    expect(fileRes.status).toBe(404);

    const ctx = { params: Promise.resolve({ id: a.projectId }) };
    const url = (path: string) => `http://localhost/api/projects/${a.projectId}/discord/${path}`;
    const post = (path: string, body: unknown) =>
      new NextRequest(url(path), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const responses = [
      await getDiscordMessages(new NextRequest(url("messages")), ctx),
      await postDiscordMessage(post("messages", { content: "Intrusion" }), ctx),
      await getDiscordStatus(new Request(url("status")), ctx),
      await postDiscordRead(post("read", { messageId: "123" }), ctx),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: "project_not_found" });
    }

    actAs(A);
    expect((await getFile(new NextRequest(`http://localhost/api/fichiers/${a.fileId}`), { params: Promise.resolve({ id: a.fileId }) })).status).toBe(200);
  });
});

describe("4. B ne peut rien écrire dans le projet de A, même en forgeant la requête", () => {
  it("toutes les actions sont refusées et la base reste identique", async () => {
    const a = await projectOfA();
    // B a son propre projet : il tente d'y rattacher des objets de A.
    actAs(B);
    const { id: bProject } = must(await createProject({ name: "Projet de B", color: "#10b981" }));
    const before = await snapshot();

    const attempts: [string, () => Promise<{ ok: boolean }>][] = [
      ["createTask", () => createTask({ projectId: a.projectId, title: "Intrusion" })],
      ["createTask (parente de A)", () => createTask({ projectId: bProject, title: "X", parentId: a.taskId })],
      ["createTask (prérequis de A)", () => createTask({ projectId: bProject, title: "X", dependsOnIds: [a.taskId] })],
      ["createTask (A responsable)", () => createTask({ projectId: bProject, title: "X", assigneeIds: [A.id] })],
      ["updateTask", () => updateTask(a.taskId, { projectId: a.projectId, title: "Piratée" })],
      ["updateTask (vers le projet de B)", () => updateTask(a.taskId, { projectId: bProject, title: "Volée" })],
      ["moveTask", () => moveTask(a.taskId, "done")],
      ["setTaskDates", () => setTaskDates(a.taskId, { startDate: null, dueDate: "2030-01-01" })],
      ["setTaskParent", () => setTaskParent(a.subtaskId, null)],
      ["deleteTask", () => deleteTask(a.taskId)],
      ["createEvent", () => createEvent({ projectId: a.projectId, title: "X", eventDate: "2026-10-01", color: "#f43f5e" })],
      ["updateEvent", () => updateEvent(a.eventId, { projectId: bProject, title: "Volé", eventDate: "2026-10-01", color: "#f43f5e" })],
      ["deleteEvent", () => deleteEvent(a.eventId)],
      ["saveImportantDay (création)", () => saveImportantDay(null, { projectId: a.projectId, date: "2026-11-01", title: "X" })],
      ["saveImportantDay (celle de A)", () => saveImportantDay(a.dayId, { projectId: bProject, date: "2026-10-07", title: "Volée" })],
      ["removeImportantDay", () => removeImportantDay(a.dayId)],
      ["startFileUpload", () => startFileUpload(a.projectId, { name: "x.pdf", size: 10, type: "application/pdf" })],
      ["finishFileUpload", () => finishFileUpload(a.fileId)],
      ["deleteFile", () => deleteFile(a.fileId)],
      ["attachGoogleDoc", () => attachGoogleDoc(a.projectId, "https://docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz/edit")],
      ["detachResource", () => detachResource(a.resourceId)],
      ["refreshProjectResources", () => refreshProjectResources(a.projectId)],
      ["linkDiscordChannel", () => linkDiscordChannel(a.projectId, "123456789012345678")],
      ["unlinkDiscordChannel", () => unlinkDiscordChannel(a.projectId)],
      ["updateProject", () => updateProject(a.projectId, { name: "Piraté", color: "#10b981" })],
      ["setProjectArchived", () => setProjectArchived(a.projectId, true)],
      ["deleteProject", () => deleteProject(a.projectId)],
      ["inviteMember (lui-même)", () => inviteMember(a.projectId, { email: B.email, role: "admin" })],
      ["removeMember", () => removeMember(a.projectId, A.id)],
      ["setMemberRole", () => setMemberRole(a.projectId, A.id, "member")],
      ["transferOwnership", () => transferOwnership(a.projectId, B.id)],
      ["leaveProject", () => leaveProject(a.projectId)],
      ["createWorkSession", () => createWorkSession(B.id, { date: "2026-09-21", start: "09:00", end: "10:00", projectId: a.projectId, note: "" })],
      ["createWorkSession (temps de A)", () => createWorkSession(A.id, { date: "2026-09-21", start: "09:00", end: "10:00", projectId: a.projectId, note: "" })],
      ["startWorkTimer", () => startWorkTimer(a.projectId)],
    ];
    for (const [name, attempt] of attempts) {
      const res = await attempt();
      expect(res.ok, name).toBe(false);
    }
    // Google Agenda : B ne peut pas choisir le projet de A (refusé avant tout appel à Google).
    expect(await saveCalendarSync({ projectIds: [a.projectId], tasksMode: "all" })).toMatchObject({ ok: false });
    // Annuler l'import d'un fichier d'un autre est sans effet (seul son auteur a un import en cours).
    await cancelFileUpload(a.fileId);

    expect(await snapshot()).toBe(before);
  });

  it("un non-membre reçoit le même message qu'un projet ou un objet inexistant", async () => {
    const a = await projectOfA();
    actAs(B);
    const MISSING = "00000000-0000-4000-8000-000000000000";
    expect(await updateProject(a.projectId, { name: "X", color: "#10b981" })).toEqual(await updateProject(MISSING, { name: "X", color: "#10b981" }));
    expect(await deleteTask(a.taskId)).toEqual(await deleteTask(MISSING));
    expect(await deleteEvent(a.eventId)).toEqual(await deleteEvent(MISSING));
    expect(await deleteFile(a.fileId)).toEqual(await deleteFile(MISSING));
    expect(await removeImportantDay(a.dayId)).toEqual(await removeImportantDay(MISSING));
  });
});

describe("5. A invite B, B accepte", () => {
  it("B voit le projet et ses données, avec le rôle member", async () => {
    const a = await projectOfA();
    actAs(A);
    const { path } = must(await inviteMember(a.projectId, { email: B.email, role: "member" }));

    actAs(B);
    must(await acceptInvitation({ token: path.split("/").pop()! }));

    expect(await getProjectOptions(B.id)).toEqual([expect.objectContaining({ id: a.projectId, role: "member" })]);
    expect((await getProjectsWithStats(B.id)).map((p) => p.name)).toEqual(["Projet secret de A"]);
    expect((await getTasks({ viewerId: B.id })).map((t) => t.title).sort()).toEqual(["Sous-tâche secrète", "Tâche secrète"]);
    expect((await getTeam(B.id)).map((m) => m.id).sort()).toEqual([A.id, B.id].sort());
    await expect(ProjectPage({ params: Promise.resolve({ id: a.projectId }) })).resolves.toBeTruthy();
    const fileRes = await getFile(new NextRequest(`http://localhost/api/fichiers/${a.fileId}`), { params: Promise.resolve({ id: a.fileId }) });
    expect(fileRes.status).toBe(200);

    // Membre : il travaille sur le contenu…
    expect(await createTask({ projectId: a.projectId, title: "Tâche de B", assigneeIds: [A.id, B.id] })).toMatchObject({ ok: true });
    // …mais ne gère ni le projet ni ses membres.
    expect(await updateProject(a.projectId, { name: "Renommé", color: "#10b981" })).toMatchObject({ ok: false });
    expect(await inviteMember(a.projectId, { email: "c@exemple.fr" })).toMatchObject({ ok: false });
    expect(await deleteProject(a.projectId)).toMatchObject({ ok: false });
    // Il n'a été ajouté qu'à ce projet.
    expect(await db.select().from(schema.projectMembers).where(eq(schema.projectMembers.userId, B.id))).toHaveLength(1);
  });
});

describe("6. un deuxième projet de A n'affiche rien du premier", () => {
  it("tâches, calendrier, journées, documents, fichiers, membres", async () => {
    await projectOfA("Premier projet");
    actAs(A);
    const { id: second } = must(await createProject({ name: "Deuxième projet", color: "#10b981" }));

    expect(await getTasks({ projectId: second })).toEqual([]);
    expect(await getCalendarItems({ from: "2026-01-01", to: "2026-12-31", projectId: second })).toEqual({ tasks: [], events: [], importantDays: [] });
    expect(await getImportantDays(second)).toEqual([]);
    expect(await getProjectResources(second)).toEqual({ resources: [], stale: false });
    expect(await getProjectFiles(second)).toEqual([]);
    expect(await search("secret", second)).toMatchObject({ tasks: [] });
    expect(await getTaskOptions(second)).toEqual([]);
    const members = await db.select().from(schema.projectMembers).where(eq(schema.projectMembers.projectId, second));
    expect(members.map((m) => [m.userId, m.role])).toEqual([[A.id, "owner"]]);
  });
});

describe("7. supprimer un projet", () => {
  it("supprime toutes ses données en cascade, et rien d'autre", async () => {
    const a = await projectOfA("À supprimer");
    const keep = await projectOfA("À garder");
    actAs(A);
    must(await inviteMember(a.projectId, { email: B.email }));
    actAs(B);
    const { id: bProject } = must(await createProject({ name: "Projet de B", color: "#10b981" }));
    must(await createTask({ projectId: bProject, title: "Tâche de B" }));

    const countFor = (projectId: string) =>
      db.execute<{ n: number }>(sql`
        select (select count(*) from project_members where project_id = ${projectId}::uuid)
             + (select count(*) from project_invitations where project_id = ${projectId}::uuid)
             + (select count(*) from tasks where project_id = ${projectId}::uuid)
             + (select count(*) from project_events where project_id = ${projectId}::uuid)
             + (select count(*) from important_days where project_id = ${projectId}::uuid)
             + (select count(*) from external_resources where project_id = ${projectId}::uuid)
             + (select count(*) from project_files where project_id = ${projectId}::uuid)
             + (select count(*) from project_discord where project_id = ${projectId}::uuid) as n
      `);
    const keepBefore = (await countFor(keep.projectId)).rows[0].n;
    const bBefore = (await countFor(bProject)).rows[0].n;
    const usersBefore = await db.select().from(schema.users).orderBy(asc(schema.users.id));

    actAs(A);
    expect(await deleteProject(a.projectId)).toEqual({ ok: true, data: undefined });

    expect(Number((await countFor(a.projectId)).rows[0].n)).toBe(0);
    expect(await db.select().from(schema.projects).where(eq(schema.projects.id, a.projectId))).toEqual([]);
    // Sous-tâches, dépendances, responsables et morceaux de fichier suivent leur parent.
    expect(await db.select().from(schema.tasks).where(eq(schema.tasks.id, a.subtaskId))).toEqual([]);
    expect(await db.select().from(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, a.taskId))).toEqual([]);
    expect(await db.select().from(schema.projectFileChunks).where(eq(schema.projectFileChunks.fileId, a.fileId))).toEqual([]);

    // Rien d'autre : les autres projets, les comptes, et le temps de travail (gardé sans projet).
    expect((await countFor(keep.projectId)).rows[0].n).toBe(keepBefore);
    expect((await countFor(bProject)).rows[0].n).toBe(bBefore);
    expect(await db.select().from(schema.users).orderBy(asc(schema.users.id))).toEqual(usersBefore);
    const sessions = await db.select().from(schema.workSessions).where(eq(schema.workSessions.userId, A.id));
    expect(sessions.map((s) => s.projectId).sort()).toEqual([keep.projectId, null].sort());
  });

  it("seul le propriétaire le peut", async () => {
    const a = await projectOfA();
    actAs(A);
    must(await inviteMember(a.projectId, { email: B.email, role: "admin" }));
    actAs(B);
    const [received] = await db.select().from(schema.projectInvitations);
    must(await acceptInvitation({ id: received.id }));
    expect(await deleteProject(a.projectId)).toEqual({ ok: false, error: "Seul le propriétaire du projet peut faire cela." });
    expect(await db.select().from(schema.projects).where(eq(schema.projects.id, a.projectId))).toHaveLength(1);
  });
});
