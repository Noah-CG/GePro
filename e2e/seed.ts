/**
 * Données des tests end-to-end : un compte et un projet par scénario, pour que chaque test parte
 * d'un Kanban connu (colonne « Terminé » vide ou remplie, tâche parente et sous-tâches).
 */
import "../scripts/env";
import { db } from "../src/db";
import { createProjectWithOwner } from "../src/db/create-project";
import { tasks, users, type TaskStatus } from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import { E2E_USER, PROJECTS } from "./fixtures";

async function main() {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Eve", lastName: "Test", email: E2E_USER.email, passwordHash: await hashPassword(E2E_USER.password) })
    .returning();

  for (const project of Object.values(PROJECTS)) {
    const { id: projectId } = await createProjectWithOwner(db, { name: project.name }, user.id);
    const ids = new Map<string, string>();
    const perStatus: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0 };
    for (const t of project.tasks) {
      const [row] = await db
        .insert(tasks)
        .values({
          projectId,
          title: t.title,
          status: t.status,
          position: ++perStatus[t.status] * 1024,
          parentId: t.parent ? ids.get(t.parent) : null,
          completedAt: t.status === "done" ? new Date() : null,
          createdBy: user.id,
        })
        .returning({ id: tasks.id });
      ids.set(t.title, row.id);
    }
  }
  console.log("✔ Données e2e chargées");
}

// Sortie explicite : PGlite garde la boucle d'événements active.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
