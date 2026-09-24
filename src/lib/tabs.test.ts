import { describe, expect, it } from "vitest";
import {
  activateTab,
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
  type TabsState,
} from "./tabs";

const P = "3b08fcaa-91af-45d6-ac57-fb01af8d079c";
const D = "0d9b8e6a-1c2f-4b3a-9d8e-7f6a5b4c3d2e";

let counter = 0;
const makeId = () => `t${++counter}`;

const state = (...urls: string[]): TabsState => ({
  tabs: urls.map((url, i) => ({ id: `t${i}`, url, title: url, scrollY: 0 })),
  activeId: "t0",
});

describe("type de page et titre", () => {
  it.each([
    ["/", "dashboard"],
    ["/taches?vue=liste", "tasks"],
    ["/projets", "projects"],
    [`/projets/${P}`, "project"],
    [`/projets/${P}/documents`, "documents"],
    [`/projets/${P}/documents/${D}`, "document"],
    [`/projets/${P}/parametres`, "settings"],
    ["/membres", "members"],
    ["/calendrier?vue=semaine&date=2026-09-24", "calendar"],
    ["/ecrans", "screens"],
    ["/inconnu", "page"],
  ])("%s → %s", (url, kind) => {
    expect(tabKind(url)).toBe(kind);
  });

  it("reprend le titre de la page, sans le suffixe de l'application", () => {
    expect(tabTitleFromDocument("Migration CRM · GePro")).toBe("Migration CRM");
    expect(tabTitleFromDocument("GePro")).toBeNull();
  });

  it("n'ouvre dans un onglet que des pages internes", () => {
    expect(isTabbableUrl(`/projets/${P}?vue=liste`)).toBe(true);
    expect(isTabbableUrl("//exemple.fr")).toBe(false);
    expect(isTabbableUrl("https://docs.google.com/document/d/x")).toBe(false);
    expect(isTabbableUrl("/api/integrations/google/connect")).toBe(false);
    expect(isTabbableUrl("/login")).toBe(false);
  });
});

describe("restoreTabs", () => {
  it("sans onglets mémorisés : un seul onglet sur la page affichée", () => {
    const s = restoreTabs("/taches", null, makeId);
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]).toMatchObject({ url: "/taches", title: "Tâches" });
  });

  it("réactive l'onglet déjà ouvert sur la page demandée", () => {
    const s = restoreTabs("/taches", state("/", "/taches"), makeId);
    expect(s.activeId).toBe("t1");
  });

  it("sinon, la page demandée remplace le contenu de l'onglet actif", () => {
    const s = restoreTabs("/membres", state("/", "/taches"), makeId);
    expect(s.tabs.map((t) => t.url)).toEqual(["/membres", "/taches"]);
    expect(s.activeId).toBe("t0");
  });

  it("ignore les données corrompues ou dangereuses", () => {
    const stored = { tabs: [{ id: "a", url: "javascript:alert(1)", title: "x", scrollY: 0 }, "n'importe quoi"], activeId: "a" };
    const s = restoreTabs("/", stored, makeId);
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].url).toBe("/");
  });
});

describe("navigation dans l'onglet actif", () => {
  it("l'onglet actif suit la page, avec un titre provisoire si le type change", () => {
    const s = syncActiveUrl(state("/"), `/projets/${P}`);
    expect(s.tabs[0]).toMatchObject({ url: `/projets/${P}`, title: "Projet" });
  });

  it("garde le titre quand seuls les paramètres changent", () => {
    const s = syncActiveUrl(setActiveTitle(state("/taches"), "Tâches"), "/taches?vue=liste");
    expect(s.tabs[0].title).toBe("Tâches");
  });
});

describe("ouvrir, activer, fermer", () => {
  it("ouvre juste après l'onglet actif et mémorise le défilement de celui qu'on quitte", () => {
    const s = openTab(state("/", "/taches"), `/projets/${P}`, "neuf", 420)!;
    expect(s.tabs.map((t) => t.id)).toEqual(["t0", "neuf", "t1"]);
    expect(s.activeId).toBe("neuf");
    expect(s.tabs[0].scrollY).toBe(420);
  });

  it(`refuse au-delà de ${MAX_TABS} onglets`, () => {
    const full = state(...Array.from({ length: MAX_TABS }, (_, i) => `/page-${i}`));
    expect(openTab(full, "/", "x", 0)).toBeNull();
  });

  it("affiche une page dans l'onglet qui l'affiche déjà, sans en ouvrir un deuxième", () => {
    const s = showInTab(state("/", `/projets/${P}/documents/${D}`), `/projets/${P}/documents/${D}`, "neuf", 120)!;
    expect(s.tabs).toHaveLength(2);
    expect(s.activeId).toBe("t1");
    expect(s.tabs[0].scrollY).toBe(120);
  });

  it("sinon, l'affiche dans un nouvel onglet, sans fermer l'actuel", () => {
    const s = showInTab(state("/"), `/projets/${P}/documents/${D}`, "neuf", 0)!;
    expect(s.tabs.map((t) => t.url)).toEqual(["/", `/projets/${P}/documents/${D}`]);
    expect(s.activeId).toBe("neuf");
  });

  it("active un onglet en mémorisant le défilement", () => {
    const s = activateTab(state("/", "/taches"), "t1", 300);
    expect(s.activeId).toBe("t1");
    expect(s.tabs[0].scrollY).toBe(300);
  });

  it("fermer l'onglet actif affiche son voisin de droite, sinon de gauche", () => {
    const three = state("/a", "/b", "/c");
    expect(closeTab({ ...three, activeId: "t1" }, "t1").navigateTo?.url).toBe("/c");
    expect(closeTab({ ...three, activeId: "t2" }, "t2").navigateTo?.url).toBe("/b");
  });

  it("fermer un onglet inactif ne change pas de page", () => {
    const { state: s, navigateTo } = closeTab(state("/a", "/b"), "t1");
    expect(navigateTo).toBeNull();
    expect(s.tabs.map((t) => t.url)).toEqual(["/a"]);
  });

  it("le dernier onglet ne se ferme pas", () => {
    const one = state("/");
    expect(closeTab(one, "t0").state).toBe(one);
  });
});
