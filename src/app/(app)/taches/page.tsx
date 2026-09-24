import type { Metadata } from "next";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { TaskBoard } from "@/components/tasks/task-board";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { getTasks } from "@/lib/queries";

export const metadata: Metadata = { title: "Tâches" };

export default async function TasksPage() {
  await requireUser();
  const tasks = await getTasks();
  const open = tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Toutes les tâches" subtitle={`${open} ouverte${open > 1 ? "s" : ""} sur ${tasks.length}, tous projets actifs confondus`} actions={<NewTaskButton />} />
      <TaskBoard tasks={tasks} />
    </div>
  );
}
