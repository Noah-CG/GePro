"use client";

import { CalendarDays, FileText, FolderKanban, LayoutDashboard, ListTodo, MonitorPlay, Plus, Settings, SquareKanban, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { GoogleDocsIcon } from "@/components/integrations/google-docs-icon";
import {
  activateTab,
  activeTab,
  closeTab,
  isTabbableUrl,
  MAX_TABS,
  openTab,
  restoreTabs,
  setActiveTitle,
  showInTab,
  syncActiveUrl,
  tabKind,
  tabTitleFromDocument,
  type Tab,
  type TabKind,
  type TabsState,
} from "@/lib/tabs";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";

type TabsContextValue = {
  /** Null jusqu'au montage : les onglets mémorisés ne sont lisibles que dans le navigateur. */
  state: TabsState | null;
  /** Ouvre `url` dans un nouvel onglet. */
  openInNewTab: (url: string) => void;
  /** Affiche `url` sans quitter l'onglet actuel : onglet existant réactivé, sinon nouvel onglet. */
  showInTab: (url: string) => void;
  activate: (id: string) => void;
  close: (id: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs doit être utilisé dans <TabsProvider>");
  return ctx;
}

/** Id du panneau de contenu, référencé par les onglets. */
const TAB_PANEL_ID = "contenu-onglet";

const storageKey = (userId: string) => `gepro:onglets:${userId}`;

/**
 * Rétablit la position de défilement d'un onglet. Le contenu peut arriver en différé (page de
 * lecture d'un document) : on réessaie à chaque image jusqu'à ce que la page soit assez haute,
 * pendant 3 s au plus, sans jamais contrarier un défilement fait par l'utilisateur entre-temps.
 */
function restoreScroll(y: number) {
  const deadline = performance.now() + 3000;
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const type of ["wheel", "touchstart", "keydown"]) window.removeEventListener(type, stop);
  };
  for (const type of ["wheel", "touchstart", "keydown"]) window.addEventListener(type, stop, { passive: true });

  const step = () => {
    if (stopped) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(y, Math.max(0, max)));
    if (max >= y || performance.now() > deadline) stop();
    else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function readStorage(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

/**
 * Onglets de GePro. Chaque onglet mémorise une adresse : changer d'onglet, c'est naviguer vers
 * elle. Ctrl/⌘ + clic ou clic du milieu sur un lien interne l'ouvre dans un nouvel onglet GePro.
 * Les onglets sont mémorisés dans ce navigateur (localStorage), par utilisateur.
 */
export function TabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { me, toast } = useApp();
  const currentUrl = search ? `${pathname}?${search}` : pathname;

  const [state, setState] = useState<TabsState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Position de défilement à rétablir après l'affichage de l'onglet activé. */
  const pendingScroll = useRef<number | null>(null);
  const key = storageKey(me.id);

  const update = (next: TabsState) => {
    stateRef.current = next;
    setState(next);
  };

  // Montage : onglets mémorisés, en affichant la page demandée.
  useEffect(() => {
    update(restoreTabs(currentUrl, readStorage(key), () => crypto.randomUUID()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigation dans l'onglet actif (lien, filtre…) : l'onglet suit, puis rétablit le défilement.
  useEffect(() => {
    if (stateRef.current) update(syncActiveUrl(stateRef.current, currentUrl));
    if (pendingScroll.current !== null) {
      restoreScroll(pendingScroll.current);
      pendingScroll.current = null;
    }
  }, [currentUrl]);

  // Titre de l'onglet actif = titre de la page (mis à jour par Next à chaque navigation).
  // Déclaré après l'effet de montage : les onglets sont déjà restaurés à son premier passage.
  useEffect(() => {
    const syncTitle = () => {
      const title = tabTitleFromDocument(document.title);
      if (title && stateRef.current) update(setActiveTitle(stateRef.current, title));
    };
    syncTitle();
    const observer = new MutationObserver(syncTitle);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  // Mémorisation dans ce navigateur.
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Stockage indisponible (navigation privée…) : les onglets durent le temps de la session.
    }
  }, [state, key]);

  const go = useCallback(
    (tab: Tab) => {
      pendingScroll.current = tab.scrollY;
      router.push(tab.url, { scroll: false });
    },
    [router],
  );

  /** Applique une transition d'onglets (ouverture…) puis affiche l'onglet devenu actif. */
  const open = useCallback(
    (url: string, transition: typeof openTab) => {
      const current = stateRef.current;
      if (!current || !isTabbableUrl(url)) return;
      const next = transition(current, url, crypto.randomUUID(), window.scrollY);
      if (!next) return toast(`${MAX_TABS} onglets au maximum : fermez-en un pour en ouvrir un autre.`, "error");
      update(next);
      if (next.activeId !== current.activeId) go(activeTab(next));
    },
    [go, toast],
  );

  const openInNewTab = useCallback((url: string) => open(url, openTab), [open]);
  const showInTabFn = useCallback((url: string) => open(url, showInTab), [open]);

  const activate = (id: string) => {
    const current = stateRef.current;
    if (!current || id === current.activeId) return;
    const next = activateTab(current, id, window.scrollY);
    update(next);
    go(activeTab(next));
  };

  const close = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const { state: next, navigateTo } = closeTab(current, id);
    update(next);
    if (navigateTo) go(navigateTo);
  };

  // Ctrl/⌘ + clic et clic du milieu sur un lien interne : nouvel onglet GePro.
  useEffect(() => {
    function onClick(e: globalThis.MouseEvent) {
      const wantsTab = e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey));
      if (!wantsTab || e.defaultPrevented) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname + url.search;
      if (!isTabbableUrl(path)) return;
      e.preventDefault();
      // Un document garde un seul onglet : on réactive celui qui l'affiche déjà.
      if (link.dataset.onglet === "document") showInTabFn(path);
      else openInNewTab(path);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, [openInNewTab, showInTabFn]);

  return (
    <TabsContext.Provider value={{ state, openInNewTab, showInTab: showInTabFn, activate, close }}>{children}</TabsContext.Provider>
  );
}

/**
 * Lien vers un document : il s'ouvre toujours dans un onglet GePro (celui qui l'affiche déjà,
 * sinon un nouveau), sans remplacer la page de l'onglet actuel.
 */
export function DocumentTabLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const { showInTab: show } = useTabs();
  return (
    <Link
      {...props}
      href={href}
      data-onglet="document"
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        // Clic simple ; Ctrl/⌘ + clic et clic du milieu passent par l'interception globale.
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        show(href);
      }}
    />
  );
}

/** Contenu de la page : panneau associé à l'onglet actif. */
export function TabPanel({ children }: { children: ReactNode }) {
  const { state } = useTabs();
  return (
    <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={state ? `onglet-${state.activeId}` : undefined} className="min-w-0 flex-1">
      {children}
    </div>
  );
}

const KIND_ICONS: Record<Exclude<TabKind, "document">, LucideIcon> = {
  dashboard: LayoutDashboard,
  tasks: ListTodo,
  projects: FolderKanban,
  project: SquareKanban,
  documents: FileText,
  settings: Settings,
  members: Users,
  calendar: CalendarDays,
  screens: MonitorPlay,
  page: FileText,
};

function TabIcon({ url }: { url: string }) {
  const kind = tabKind(url);
  if (kind === "document") return <GoogleDocsIcon size={13} className="shrink-0" />;
  const Icon = KIND_ICONS[kind];
  return <Icon size={14} className="shrink-0" aria-hidden />;
}

/** Barre d'onglets : ←/→ (et Début/Fin) déplacent le focus, Entrée ouvre, Suppr ferme. */
export function TabBar() {
  const { state, activate, close, openInNewTab } = useTabs();
  const bar = "sticky top-14 z-20 flex h-10 shrink-0 items-end gap-1 border-b border-border bg-bg px-2 md:top-0 md:px-4";
  // Avant le montage : barre vide de même hauteur (pas de décalage du contenu).
  if (!state) return <div className={bar} aria-hidden />;

  const canClose = state.tabs.length > 1;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const buttons = [...(e.currentTarget.closest("[role=tablist]")?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [])];
    const focusAt = (i: number) => buttons[(i + buttons.length) % buttons.length]?.focus();
    if (e.key === "ArrowRight") focusAt(index + 1);
    else if (e.key === "ArrowLeft") focusAt(index - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(buttons.length - 1);
    else if (e.key === "Delete" && canClose) close(state!.tabs[index].id);
    else return;
    e.preventDefault();
  }

  // Sans barre de défilement visible : la molette fait défiler les onglets horizontalement.
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
  }

  return (
    <div className={bar}>
      <div
        role="tablist"
        aria-label="Onglets"
        onWheel={onWheel}
        className="no-scrollbar flex min-w-0 items-end gap-1 overflow-x-auto overflow-y-hidden"
      >
        {state.tabs.map((tab, index) => {
          const active = tab.id === state.activeId;
          return (
            <div
              key={tab.id}
              // Clic du milieu : ferme l'onglet (sans lancer le défilement automatique).
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              onAuxClick={(e) => e.button === 1 && canClose && close(tab.id)}
              className={cn(
                "group flex max-w-56 min-w-0 shrink-0 items-center rounded-t-lg border border-b-0 text-sm transition-colors",
                active ? "border-border bg-surface text-text" : "border-transparent text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <button
                role="tab"
                id={`onglet-${tab.id}`}
                aria-selected={active}
                aria-controls={TAB_PANEL_ID}
                tabIndex={active ? 0 : -1}
                title={tab.title}
                onClick={() => activate(tab.id)}
                onKeyDown={(e) => onKeyDown(e, index)}
                className={cn("flex min-w-0 items-center gap-1.5 py-1.5 pl-3", canClose ? "pr-1" : "pr-3")}
              >
                <TabIcon url={tab.url} />
                <span className="truncate">{tab.title}</span>
              </button>
              {canClose && (
                <button
                  onClick={() => close(tab.id)}
                  aria-label={`Fermer l'onglet ${tab.title}`}
                  tabIndex={-1}
                  className={cn(
                    "mr-1.5 rounded p-0.5 text-muted hover:bg-surface-2 hover:text-text",
                    !active && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={() => openInNewTab("/")}
        aria-label="Nouvel onglet"
        title="Nouvel onglet (ou Ctrl + clic sur un lien)"
        className="mb-1 shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
