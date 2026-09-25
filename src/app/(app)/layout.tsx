import { cookies } from "next/headers";
import { AppProvider } from "@/components/layout/app-provider";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";
import { resolveSelectedProjectId, SELECTED_PROJECT_COOKIE } from "@/lib/current-project";
import { todayISO } from "@/lib/dates";
import { isDiscordConfigured } from "@/lib/discord/client";
import { getDiscordChannelViews } from "@/lib/discord/service";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { COLLAPSED_SECTIONS_COOKIE, parseCollapsedSections, SIDEBAR_COLLAPSED_COOKIE } from "@/lib/navigation-prefs";
import { getConnectionView, getFileLinks, getProjectOptions, getProjectsWithStats, getResourceLinks, getRunningSince, getTeam } from "@/lib/queries";

/** Toutes les pages de ce groupe nécessitent d'être connecté. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const today = todayISO();
  const discordConfigured = isDiscordConfigured();
  const [team, projects, projectStats, resources, files, googleConnection, runningSince, discordChannels, cookieStore] = await Promise.all([
    getTeam(),
    getProjectOptions(),
    getProjectsWithStats({ today }),
    getResourceLinks(),
    getFileLinks(),
    getConnectionView(me.id, "google"),
    getRunningSince(me.id),
    discordConfigured ? getDiscordChannelViews() : {},
    cookies(),
  ]);

  const sidebar = {
    projects: projectStats,
    resources,
    files,
    timerRunning: runningSince !== null,
    google: { configured: isGoogleConfigured(), connection: googleConnection },
  };
  // Le layout ne connaît pas l'adresse : l'interface privilégie ensuite le projet de l'URL.
  const selectedProjectId = resolveSelectedProjectId({
    pathname: "",
    rememberedId: cookieStore.get(SELECTED_PROJECT_COOKIE)?.value,
    projects,
  });
  const prefs = {
    collapsed: cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1",
    collapsedSections: parseCollapsedSections(cookieStore.get(COLLAPSED_SECTIONS_COOKIE)?.value),
  };

  return (
    <AppProvider me={me} team={team} projects={projects} today={today} selectedProjectId={selectedProjectId}>
      <AppShell sidebar={sidebar} prefs={prefs} discord={{ configured: discordConfigured, channels: discordChannels }}>
        {children}
      </AppShell>
    </AppProvider>
  );
}
