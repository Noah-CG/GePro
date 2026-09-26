"use client";

/**
 * Contexte global de l'application (côté client) :
 * - données partagées : utilisateur connecté, équipe, projets, date du jour ;
 * - projet sélectionné (tout le site n'affiche que lui, voir lib/current-project.ts) ;
 * - ouverture des fenêtres "tâche", "projet" et de la recherche depuis n'importe où ;
 * - raccourcis clavier globaux ;
 * - notifications (toasts).
 */
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";
import { projectIdFromPath, resolveSelectedProjectId, SELECTED_PROJECT_COOKIE } from "@/lib/current-project";
import { savePreferenceCookie } from "@/lib/navigation-prefs";
import type { Member, ProjectOption, ProjectWithStats, TaskView } from "@/lib/queries";
import { CommandPalette } from "./command-palette";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { TaskDialog, type TaskDraft } from "@/components/tasks/task-dialog";
import { cn } from "@/lib/utils";

/** Bouton d'un toast (par exemple « Terminer »), qui ferme le toast une fois cliqué. */
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; kind: "success" | "error"; action?: ToastAction };

type AppContextValue = {
  me: SessionUser;
  team: Member[];
  membersById: Map<string, Member>;
  projects: ProjectOption[];
  today: string;
  /** Projet sélectionné (null s'il n'existe aucun projet). */
  currentProjectId: string | null;
  /** Change de projet sélectionné (mémorisé ; aux pages de se mettre à jour). */
  selectProject: (id: string) => void;
  /** Ouvre la création de tâche, éventuellement pré-remplie (projet, statut...). */
  newTask: (defaults?: Partial<TaskDraft>) => void;
  editTask: (task: TaskView) => void;
  newProject: () => void;
  editProject: (project: ProjectWithStats) => void;
  openSearch: () => void;
  toast: (message: string, kind?: Toast["kind"], action?: ToastAction) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans <AppProvider>");
  return ctx;
}

/** Vrai si l'utilisateur est en train de saisir du texte (on ne déclenche alors pas les raccourcis). */
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export function AppProvider({
  me,
  team,
  projects,
  today,
  selectedProjectId,
  children,
}: {
  me: SessionUser;
  team: Member[];
  projects: ProjectOption[];
  today: string;
  /** Projet sélectionné d'après le cookie, au chargement. */
  selectedProjectId: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [rememberedId, setRememberedId] = useState(selectedProjectId);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: TaskView; defaults?: Partial<TaskDraft> }>({
    open: false,
  });
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project?: ProjectWithStats }>({ open: false });
  const [searchOpen, setSearchOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const membersById = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  // Projet de l'adresse, sinon le dernier choisi. Une nouvelle tâche y est rattachée par défaut.
  const currentProjectId = resolveSelectedProjectId({ pathname, rememberedId, projects });

  const selectProject = useCallback((id: string) => {
    setRememberedId(id);
    savePreferenceCookie(SELECTED_PROJECT_COOKIE, id);
  }, []);

  // Ouvrir la page d'un projet le sélectionne : les autres pages le montreront ensuite.
  const urlProjectId = projectIdFromPath(pathname);
  useEffect(() => {
    if (urlProjectId && urlProjectId !== rememberedId && projects.some((p) => p.id === urlProjectId)) selectProject(urlProjectId);
  }, [urlProjectId, rememberedId, projects, selectProject]);

  const newTask = useCallback(
    (defaults?: Partial<TaskDraft>) => {
      setSearchOpen(false);
      setTaskDialog({ open: true, defaults: { projectId: currentProjectId ?? undefined, ...defaults } });
    },
    [currentProjectId],
  );

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, kind: Toast["kind"] = "success", action?: ToastAction) => {
      const id = ++toastId.current;
      setToasts((t) => [...t, { id, message, kind, action }]);
      // Avec un bouton, on laisse le temps de le lire et de cliquer.
      setTimeout(() => dismissToast(id), action ? 8000 : 3500);
    },
    [dismissToast],
  );

  const anyDialogOpen = taskDialog.open || projectDialog.open || searchOpen;

  // Raccourcis clavier globaux.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || anyDialogOpen) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        newTask();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setProjectDialog({ open: true });
      } else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyDialogOpen, newTask]);

  const value: AppContextValue = {
    me,
    team,
    membersById,
    projects,
    today,
    currentProjectId,
    selectProject,
    newTask,
    editTask: (task) => setTaskDialog({ open: true, task }),
    newProject: () => {
      setSearchOpen(false);
      setProjectDialog({ open: true });
    },
    editProject: (project) => setProjectDialog({ open: true, project }),
    openSearch: () => setSearchOpen(true),
    toast,
  };

  return (
    <AppContext.Provider value={value}>
      {children}

      <TaskDialog
        // La clé force un formulaire neuf à chaque ouverture.
        key={`task-${taskDialog.open ? (taskDialog.task?.id ?? "new") : "closed"}`}
        open={taskDialog.open}
        task={taskDialog.task}
        defaults={taskDialog.defaults}
        onOpenChange={(open) => setTaskDialog((s) => ({ ...s, open }))}
      />
      <ProjectDialog
        key={`project-${projectDialog.open ? (projectDialog.project?.id ?? "new") : "closed"}`}
        open={projectDialog.open}
        project={projectDialog.project}
        onOpenChange={(open) => setProjectDialog((s) => ({ ...s, open }))}
      />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg",
              t.kind === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-border bg-surface text-text",
            )}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismissToast(t.id);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
