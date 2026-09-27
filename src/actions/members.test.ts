import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { insertUser, resetDb } from "@/test/db";
import { createMember, deleteMember, resetMemberPassword } from "./members";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
vi.mock("@/lib/auth", async () => ({ ...(await vi.importActual<object>("@/lib/password")), requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const UNKNOWN = "00000000-0000-4000-8000-000000000000";
let admin: Awaited<ReturnType<typeof insertUser>>;

beforeEach(async () => {
  await resetDb(db);
  admin = await insertUser(db, "Alice Admin");
  vi.mocked(requireAdmin).mockResolvedValue({ ...admin, role: "admin" });
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("administration des comptes", () => {
  it("refuse un email déjà pris, sans tenir compte de la casse", async () => {
    const input = { firstName: "Léa", lastName: "Dubois", email: admin.email.toUpperCase(), password: "un-mot-de-passe-solide" };
    expect(await createMember(input)).toEqual({ ok: false, error: "Un compte existe déjà avec cet email." });
    expect(await createMember({ ...input, email: "lea@exemple.fr" })).toEqual({ ok: true, data: undefined });
  });

  it("réinitialise un mot de passe, ferme les sessions du compte et le journalise", async () => {
    const lea = await insertUser(db, "Léa Dubois");
    await db.insert(sessions).values({ id: "s1", userId: lea.id, expiresAt: new Date(Date.now() + 86_400_000) });
    expect(await resetMemberPassword(lea.id, "nouveau-mot-de-passe")).toEqual({ ok: true, data: undefined });
    expect(await db.select().from(sessions).where(eq(sessions.userId, lea.id))).toEqual([]);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(`réinitialisé par ${admin.email}`));
  });

  it("signale un compte introuvable au lieu d'échouer", async () => {
    expect(await resetMemberPassword("pas-un-uuid", "nouveau-mot-de-passe")).toEqual({ ok: false, error: "Compte introuvable." });
    expect(await resetMemberPassword(UNKNOWN, "nouveau-mot-de-passe")).toEqual({ ok: false, error: "Compte introuvable." });
    expect(await deleteMember("pas-un-uuid")).toEqual({ ok: false, error: "Compte introuvable." });
    expect(await deleteMember(UNKNOWN)).toEqual({ ok: false, error: "Compte introuvable." });
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
