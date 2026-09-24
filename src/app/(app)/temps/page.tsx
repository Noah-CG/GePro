import { CalendarDays, Clock, History, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiveDuration } from "@/components/time/live-duration";
import { MemberPicker } from "@/components/time/member-picker";
import { HistoryLink, WorkJournal } from "@/components/time/work-session-list";
import { WorkTimer } from "@/components/time/work-timer";
import { Avatar } from "@/components/ui/avatar";
import { Card, PageHeader, Section, Stat } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatDuration, formatTime, todayISO, zonedParts } from "@/lib/dates";
import { getProjectTeamWork, getTeam, getWorkByProject, getWorkSessions, getWorkSummary } from "@/lib/queries";
import { getSelectedProject } from "@/lib/selected-project";
import { isUuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Temps de travail" };

type Props = { searchParams: Promise<{ membre?: string; historique?: string }> };

/** Périodes affichées dans le journal, sauf avec ?historique=tout. */
const RECENT_SESSIONS = 20;

/**
 * Temps de travail : le chrono, le journal de bord (périodes corrigeables), le temps par projet
 * et celui de l'équipe sur le projet sélectionné. `?membre=<id>` affiche le temps d'un autre
 * membre (administrateurs seulement).
 */
export default async function TimePage({ searchParams }: Props) {
  const me = await requireUser();
  const { membre, historique } = await searchParams;
  if (membre && me.role !== "admin" && membre !== me.id) redirect("/temps");

  const team = await getTeam();
  const member = team.find((m) => m.id === (membre && isUuid(membre) ? membre : me.id));
  if (!member) notFound();
  const self = member.id === me.id;
  const showAll = historique === "tout";
  const today = todayISO();

  const project = await getSelectedProject();
  const [work, sessions, byProject, teamWork] = await Promise.all([
    getWorkSummary(member.id, today),
    getWorkSessions(member.id, showAll ? 1000 : RECENT_SESSIONS),
    getWorkByProject(member.id),
    project ? getProjectTeamWork(project.id, today) : Promise.resolve([]),
  ]);

  // Le chrono en cours compte dans les totaux affichés.
  const now = Date.now();
  const running = work.runningSince ? now - new Date(work.runningSince).getTime() : 0;
  const projectMax = Math.max(1, ...byProject.map((p) => p.ms));
  const baseHref = self ? "/temps" : `/temps?membre=${member.id}`;

  // Équipe sur le projet sélectionné : chronos en cours d'abord, puis temps de la semaine.
  const byMember = new Map(teamWork.map((w) => [w.userId, w]));
  const teamRows = team
    .map((m) => {
      const w = byMember.get(m.id);
      const since = w?.runningSince ?? null;
      return { member: m, since, weekMs: (w?.weekMs ?? 0) + (since ? now - new Date(since).getTime() : 0) };
    })
    .filter((r) => r.since || r.weekMs > 0)
    .sort((a, b) => Number(!!b.since) - Number(!!a.since) || b.weekMs - a.weekMs);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={
          self ? (
            "Temps de travail"
          ) : (
            <span className="flex items-center gap-3">
              <Avatar user={member} size={30} />
              Temps de {member.name}
            </span>
          )
        }
        subtitle={self ? "Votre chrono, votre journal de bord et le temps de l'équipe" : member.email}
        actions={me.role === "admin" && team.length > 1 && <MemberPicker team={team} value={member.id} meId={me.id} />}
      />

      {self && (
        <Card className="mb-6">
          <WorkTimer summary={work} large />
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Clock size={16} />} label="Aujourd'hui" value={formatDuration(work.todayMs + running)} tone="accent" />
        <Stat icon={<CalendarDays size={16} />} label="Cette semaine" value={formatDuration(work.weekMs + running)} />
        <Stat icon={<Timer size={16} />} label="Total" value={formatDuration(work.totalMs + running)} />
        <Stat icon={<History size={16} />} label="Périodes enregistrées" value={work.sessions} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <WorkJournal
            total={work.sessions + (work.runningSince ? 1 : 0)}
            editable={self || me.role === "admin"}
            userId={member.id}
            memberName={self ? undefined : member.name}
            today={today}
            now={zonedParts(new Date(now).toISOString()).time}
            historyLink={
              work.sessions > RECENT_SESSIONS && (
                <HistoryLink href={showAll ? baseHref : `${baseHref}${self ? "?" : "&"}historique=tout`} showAll={showAll} />
              )
            }
            sessions={sessions.map((s) => {
              const start = zonedParts(s.startedAt);
              return {
                label: `${formatDateTime(s.startedAt)} → ${s.endedAt ? formatTime(s.endedAt) : "en cours"}`,
                durationLabel: formatDuration((s.endedAt ? new Date(s.endedAt).getTime() : now) - new Date(s.startedAt).getTime()),
                running: !s.endedAt,
                projectName: s.projectName,
                projectColor: s.projectColor,
                session: {
                  id: s.id,
                  date: start.date,
                  start: start.time,
                  end: s.endedAt ? zonedParts(s.endedAt).time : null,
                  projectId: s.projectId,
                  note: s.note,
                },
              };
            })}
          />
        </div>

        <div className="space-y-6">
          <Section title="Temps par projet">
            {byProject.length === 0 && <p className="p-4 text-sm text-muted">Aucun temps enregistré.</p>}
            <ul className="space-y-3 p-4 empty:hidden">
              {byProject.map((p) => (
                <li key={p.projectId ?? "aucun"}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? "var(--muted)" }} />
                      <span className="truncate">{p.name ?? "Sans projet"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{formatDuration(p.ms)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${(p.ms / projectMax) * 100}%`, background: p.color ?? "var(--muted)" }} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          {project && (
            <Section title={`Équipe · ${project.name}`} action={<span className="text-xs text-muted">cette semaine</span>}>
              {teamRows.length === 0 ? (
                <p className="p-4 text-sm text-muted">Aucun temps enregistré sur ce projet cette semaine.</p>
              ) : (
                <ul className="space-y-3 p-4">
                  {teamRows.map(({ member: m, since, weekMs }) => (
                    <li key={m.id} className="flex items-center gap-3 text-sm">
                      <span className="relative shrink-0">
                        <Avatar user={m} size={26} />
                        {since && (
                          <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface motion-safe:animate-pulse" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        {me.role === "admin" || m.id === me.id ? (
                          <Link href={m.id === me.id ? "/temps" : `/temps?membre=${m.id}`} className="block truncate hover:text-accent hover:underline">
                            {m.name}
                          </Link>
                        ) : (
                          <p className="truncate">{m.name}</p>
                        )}
                        {since && (
                          <p className="text-xs text-success">
                            Chrono en cours depuis {formatTime(since)} ·{" "}
                            <LiveDuration since={since} initialMs={now - new Date(since).getTime()} />
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs font-medium tabular-nums">{formatDuration(weekMs)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
