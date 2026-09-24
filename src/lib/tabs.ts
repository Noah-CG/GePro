/**
 * Onglets de GePro : chaque onglet mémorise une adresse de l'application (projet, document,
 * liste de tâches…). Un seul onglet est affiché à la fois ; en changer, c'est naviguer vers son
 * adresse. Logique pure (sans React ni navigateur) : testable et partagée par la barre d'onglets.
 */

export const MAX_TABS = 10;

export type Tab = {
  id: string;
  /** Chemin + paramètres, ex. "/projets/<id>?vue=liste". */
  url: string;
  title: string;
  /** Position de défilement mémorisée en quittant l'onglet. */
  scrollY: number;
};

export type TabsState = { tabs: Tab[]; activeId: string };

export type TabKind = "dashboard" | "tasks" | "projects" | "project" | "documents" | "document" | "settings" | "members" | "screens" | "page";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KINDS: [RegExp, TabKind][] = [
  [/^\/$/, "dashboard"],
  [/^\/taches$/, "tasks"],
  [/^\/projets$/, "projects"],
  [new RegExp(`^/projets/${UUID}$`, "i"), "project"],
  [new RegExp(`^/projets/${UUID}/documents$`, "i"), "documents"],
  [new RegExp(`^/projets/${UUID}/documents/${UUID}$`, "i"), "document"],
  [new RegExp(`^/projets/${UUID}/parametres$`, "i"), "settings"],
  [/^\/membres$/, "members"],
  [/^\/ecrans$/, "screens"],
];

export function tabKind(url: string): TabKind {
  const path = url.split(/[?#]/)[0];
  return KINDS.find(([re]) => re.test(path))?.[1] ?? "page";
}

const DEFAULT_TITLES: Record<TabKind, string> = {
  dashboard: "Tableau de bord",
  tasks: "Tâches",
  projects: "Projets",
  project: "Projet",
  documents: "Documents",
  document: "Document",
  settings: "Paramètres",
  members: "Membres",
  screens: "Multi-écran",
  page: "GePro",
};

/** Titre provisoire, en attendant celui de la page. */
const defaultTabTitle = (url: string) => DEFAULT_TITLES[tabKind(url)];

/** Titre d'onglet à partir du titre de la page ("Migration CRM · GePro" → "Migration CRM"). */
export function tabTitleFromDocument(documentTitle: string): string | null {
  const title = documentTitle.replace(/\s*·\s*GePro$/, "").trim();
  return title && title !== "GePro" ? title : null;
}

/** Adresse interne ouvrable dans un onglet : ni externe, ni API, ni page de connexion. */
export function isTabbableUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !/^\/(api|login)(\/|\?|$)/.test(url);
}

const newTab = (id: string, url: string): Tab => ({ id, url, title: defaultTabTitle(url), scrollY: 0 });

function isTab(value: unknown): value is Tab {
  const t = value as Tab;
  return (
    typeof t === "object" &&
    t !== null &&
    typeof t.id === "string" &&
    typeof t.url === "string" &&
    isTabbableUrl(t.url) &&
    typeof t.title === "string" &&
    typeof t.scrollY === "number"
  );
}

/**
 * Onglets au chargement de la page : ceux mémorisés s'ils sont valides, en affichant la page
 * demandée (un onglet déjà ouvert sur cette adresse est réactivé ; sinon elle remplace le
 * contenu de l'onglet actif, comme une adresse tapée dans la barre du navigateur).
 */
export function restoreTabs(currentUrl: string, stored: unknown, makeId: () => string): TabsState {
  const saved = stored as Partial<TabsState> | null;
  const tabs = Array.isArray(saved?.tabs) ? saved.tabs.filter(isTab).slice(0, MAX_TABS) : [];
  if (tabs.length === 0) {
    const tab = newTab(makeId(), currentUrl);
    return { tabs: [tab], activeId: tab.id };
  }
  const existing = tabs.find((t) => t.url === currentUrl);
  if (existing) return { tabs, activeId: existing.id };
  const activeId = tabs.some((t) => t.id === saved?.activeId) ? saved!.activeId! : tabs[0].id;
  return syncActiveUrl({ tabs, activeId }, currentUrl);
}

export const activeTab = (state: TabsState): Tab => state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];

const updateTab = (state: TabsState, id: string, patch: Partial<Tab>): TabsState => ({
  ...state,
  tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

/** La page affichée a changé (lien suivi dans l'onglet actif) : l'onglet actif suit. */
export function syncActiveUrl(state: TabsState, url: string): TabsState {
  const active = activeTab(state);
  if (active.url === url) return state;
  // Nouveau type de page : titre provisoire en attendant le vrai.
  const title = tabKind(active.url) === tabKind(url) ? active.title : defaultTabTitle(url);
  return updateTab(state, active.id, { url, title, scrollY: 0 });
}

export function setActiveTitle(state: TabsState, title: string): TabsState {
  const active = activeTab(state);
  return active.title === title ? state : updateTab(state, active.id, { title });
}

/** Ouvre `url` dans un nouvel onglet, juste après l'onglet actif. Null si la limite est atteinte. */
export function openTab(state: TabsState, url: string, id: string, currentScrollY: number): TabsState | null {
  if (state.tabs.length >= MAX_TABS) return null;
  const saved = updateTab(state, state.activeId, { scrollY: currentScrollY });
  const index = saved.tabs.findIndex((t) => t.id === state.activeId);
  const tabs = [...saved.tabs.slice(0, index + 1), newTab(id, url), ...saved.tabs.slice(index + 1)];
  return { tabs, activeId: id };
}

/**
 * Affiche `url` sans quitter l'onglet actuel : l'onglet qui l'affiche déjà est réactivé, sinon
 * un nouvel onglet s'ouvre. Null si un nouvel onglet est nécessaire mais la limite atteinte.
 */
export function showInTab(state: TabsState, url: string, id: string, currentScrollY: number): TabsState | null {
  const existing = state.tabs.find((t) => t.url === url);
  if (existing) return activateTab(state, existing.id, currentScrollY);
  return openTab(state, url, id, currentScrollY);
}

/** Active un onglet en mémorisant la position de défilement de celui qu'on quitte. */
export function activateTab(state: TabsState, id: string, currentScrollY: number): TabsState {
  if (id === state.activeId || !state.tabs.some((t) => t.id === id)) return state;
  return { ...updateTab(state, state.activeId, { scrollY: currentScrollY }), activeId: id };
}

/**
 * Ferme un onglet (jamais le dernier). Fermer l'onglet actif active son voisin de droite, ou à
 * défaut de gauche : `navigateTo` est alors l'onglet à afficher.
 */
export function closeTab(state: TabsState, id: string): { state: TabsState; navigateTo: Tab | null } {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0 || state.tabs.length === 1) return { state, navigateTo: null };
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (id !== state.activeId) return { state: { ...state, tabs }, navigateTo: null };
  const next = tabs[Math.min(index, tabs.length - 1)];
  return { state: { tabs, activeId: next.id }, navigateTo: next };
}
