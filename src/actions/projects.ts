"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { firstError, projectInput, type ProjectInput } from "@/lib/validation";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const [project] = await db
    .insert(projects)
    .values({ ...parsed.data, createdBy: me.id })
    .returning({ id: projects.id });
  refresh();
  return ok({ id: project.id });
}

export async function updateProject(id: string, input: ProjectInput): Promise<ActionResult> {
  await requireUser();
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  await db.update(projects).set(parsed.data).where(eq(projects.id, id));
  refresh();
  return ok(undefined);
}

export async function setProjectArchived(id: string, archived: boolean): Promise<ActionResult> {
  await requireUser();
  await db
    .update(projects)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(projects.id, id));
  refresh();
  return ok(undefined);
}
