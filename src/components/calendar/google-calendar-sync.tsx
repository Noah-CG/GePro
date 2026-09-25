"use client";

import { AlertTriangle, CalendarSync, CheckCircle2, ExternalLink, RotateCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveCalendarSync, stopCalendarSync, syncCalendarNow } from "@/actions/calendar-sync";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/input";
import type { CalendarTasksMode } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import type { CalendarSyncView } from "@/lib/integrations/calendar-sync";
import { integrationErrorMessage, isIntegrationErrorCode } from "@/lib/integrations/errors";
import { cn } from "@/lib/utils";

const CONNECT_HREF = "/api/integrations/google/connect?agenda=1";

const TASK_MODES: { value: CalendarTasksMode; label: string }[] = [
  { value: "mine", label: "Mes tâches" },
  { value: "all", label: "Toutes" },
  { value: "none", label: "Aucune" },
];

/** Retour de la connexion Google (?google=connected|error&reason=…) : ouvre la fenêtre avec un message. */
type Notice = { kind: "success" | "error"; message: string };

function oauthNotice(google: string | null, reason: string | null): Notice | null {
  if (google === "connected") return { kind: "success", message: "Accès à Google Agenda autorisé. Choisissez ce que vous voulez synchroniser." };
  if (google === "error") return { kind: "error", message: integrationErrorMessage(isIntegrationErrorCode(reason) ? reason : "unknown") };
  return null;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * Bouton « Google Agenda » du calendrier et sa fenêtre : autorisation de l'accès à l'agenda,
 * choix des projets et des échéances, état de la dernière synchronisation.
 */
export function GoogleCalendarSync({ view, google, reason }: { view: CalendarSyncView; google: string | null; reason: string | null }) {
  const { projects, toast } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [notice] = useState(() => oauthNotice(google, reason));
  const [open, setOpen] = useState(notice !== null);
  const [pending, startTransition] = useTransition();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [removeCalendar, setRemoveCalendar] = useState(false);

  const sync = view.sync;
  const [projectIds, setProjectIds] = useState<string[]>(sync?.projectIds ?? []);
  const [tasksMode, setTasksMode] = useState<CalendarTasksMode>(sync?.tasksMode ?? "mine");

  // Retire ?google=… de l'adresse : recharger la page ne doit pas rouvrir la fenêtre.
  useEffect(() => {
    if (!google) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("google");
    params.delete("reason");
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  }, [google, pathname, router]);

  if (!view.configured) return null;

  const canSync = view.account?.status === "active" && view.account.hasCalendarScope;
  const active = canSync && sync !== null;
  const activeProjects = projects.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  function toggleProject(id: string) {
    setProjectIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function save() {
    startTransition(async () => {
      const res = await saveCalendarSync({ projectIds, tasksMode });
      if (!res.ok) return toast(res.error, "error");
      toast(`Google Agenda synchronisé : ${plural(res.data.total, "élément")}`);
    });
  }

  function syncNow() {
    startTransition(async () => {
      const res = await syncCalendarNow();
      if (!res.ok) return toast(res.error, "error");
      const changes = res.data.upserted + res.data.deleted;
      toast(changes ? `Google Agenda mis à jour (${plural(changes, "modification")})` : "Google Agenda déjà à jour");
    });
  }

  function stop() {
    if (!confirmingStop) return setConfirmingStop(true);
    startTransition(async () => {
      const res = await stopCalendarSync(removeCalendar);
      if (!res.ok) return toast(res.error, "error");
      setConfirmingStop(false);
      toast(removeCalendar ? "Synchronisation arrêtée, agenda « GePro » supprimé" : "Synchronisation arrêtée");
    });
  }

  const lastError = sync?.lastError ?? null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <CalendarSync size={14} />
        Google Agenda
        {active && (
          <span
            aria-label={lastError ? "Erreur de synchronisation" : "Synchronisé"}
            className={cn("h-1.5 w-1.5 rounded-full", lastError ? "bg-warning" : "bg-success")}
          />
        )}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setConfirmingStop(false);
        }}
        title="Synchroniser avec Google Agenda"
        description="GePro remplit un agenda « GePro » dans votre compte Google. Sens unique : les modifications faites dans Google ne remontent pas."
      >
        <div className="space-y-5">
          {notice && (
            <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", notice.kind === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
              {notice.message}
            </p>
          )}

          {!canSync ? (
            <ConnectStep view={view} />
          ) : (
            <>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Projets</legend>
                <p className="mb-2 text-xs text-muted">Les événements d&apos;équipe (sans projet) sont toujours inclus.</p>
                {activeProjects.length === 0 ? (
                  <p className="text-sm text-muted">Aucun projet actif.</p>
                ) : (
                  <ul className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
                    {activeProjects.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                          <input type="checkbox" checked={projectIds.includes(p.id)} onChange={() => toggleProject(p.id)} className="accent-[var(--accent)]" />
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                          <span className="truncate">{p.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <div>
                <p className="mb-1 text-sm font-medium">
                  Échéances des tâches
                </p>
                <p className="mb-2 text-xs text-muted">Tâches non terminées des projets choisis, à leur date d&apos;échéance.</p>
                <Segmented label="Échéances des tâches" value={tasksMode} onChange={setTasksMode} options={TASK_MODES} />
              </div>

              {sync && (
                <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  {lastError ? (
                    <p className="flex items-start gap-1.5 text-warning">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {integrationErrorMessage(isIntegrationErrorCode(lastError) ? lastError : "unknown")}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-muted">
                      <CheckCircle2 size={14} className="shrink-0 text-success" />
                      {sync.lastSyncedAt ? `Dernière synchronisation complète : ${formatDateTime(sync.lastSyncedAt)}` : "Synchronisation en attente"}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">Compte : {view.account?.email || "Google"}. Chaque modification dans GePro est envoyée en quelques secondes.</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={save} loading={pending && !confirmingStop}>
                  {sync ? "Enregistrer" : "Activer la synchronisation"}
                </Button>
                {sync && (
                  <Button onClick={syncNow} disabled={pending}>
                    <RotateCw size={14} /> Synchroniser maintenant
                  </Button>
                )}
                <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost", size: "md" })}>
                  Ouvrir Google Agenda <ExternalLink size={12} aria-hidden />
                </a>
              </div>

              {sync && (
                <div className="border-t border-border pt-4">
                  {confirmingStop && (
                    <label className="mb-2 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={removeCalendar} onChange={(e) => setRemoveCalendar(e.target.checked)} className="accent-[var(--danger)]" />
                      Supprimer aussi l&apos;agenda « GePro » de Google Agenda
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant={confirmingStop ? "danger" : "ghost"} onClick={stop} loading={pending && confirmingStop}>
                      {confirmingStop ? "Confirmer l'arrêt" : "Arrêter la synchronisation"}
                    </Button>
                    {confirmingStop && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingStop(false)}>
                        Annuler
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}

/** Pas encore de droit sur Google Agenda : l'expliquer et proposer l'autorisation. */
function ConnectStep({ view }: { view: CalendarSyncView }) {
  const reauth = view.account?.status === "needs_reauth";
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        {reauth
          ? "Votre connexion Google a expiré ou a été révoquée. Reconnectez-vous pour reprendre la synchronisation."
          : view.account
            ? `Votre compte Google (${view.account.email || "connecté"}) doit encore autoriser GePro à gérer un agenda.`
            : "Connectez votre compte Google pour recevoir les événements et échéances de GePro dans Google Agenda."}
      </p>
      <p className="text-xs text-muted">
        GePro demande uniquement l&apos;accès aux agendas qu&apos;il crée lui-même : il ne voit pas vos autres agendas ni vos
        rendez-vous.
      </p>
      <a href={CONNECT_HREF} className={buttonClass({ variant: "primary" })}>
        {reauth ? "Reconnecter mon compte Google" : "Autoriser l'accès à Google Agenda"}
      </a>
    </div>
  );
}
