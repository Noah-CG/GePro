import { AppProvider } from "@/components/layout/app-provider";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { getProjectOptions, getTeam } from "@/lib/queries";

/** Toutes les pages de ce groupe nécessitent d'être connecté. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const [team, projects] = await Promise.all([getTeam(), getProjectOptions()]);

  return (
    <AppProvider me={me} team={team} projects={projects} today={todayISO()}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
