/**
 * Glisser-déposer du Kanban dans un vrai navigateur : la carte doit arriver dans la colonne visée
 * et y rester après rechargement (donc être enregistrée), notamment vers « Terminé » vide.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_USER, PROJECTS } from "./fixtures";

type Column = "À faire" | "En cours" | "Terminé";

const column = (page: Page, label: Column) => page.locator(`section[aria-label="${label}"]`);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Carte par son titre exact (une sous-tâche affiche aussi le nom de sa parente). */
const card = (page: Page, label: Column, title: string) =>
  column(page, label)
    .locator("[aria-roledescription=sortable]")
    .filter({ has: page.locator("p").filter({ hasText: new RegExp(`^${escapeRegExp(title)}$`) }) });

async function login(page: Page) {
  await page.goto("/connexion");
  await page.fill("#email", E2E_USER.email);
  await page.fill("#password", E2E_USER.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"));
}

/**
 * Attend que le Kanban soit interactif : dnd-kit n'insère sa région d'annonces qu'une fois monté
 * côté navigateur. Sans cela, en dev, un glisser lancé avant l'hydratation ne fait rien.
 */
async function ready(page: Page) {
  await expect(page.locator('[id^="DndLiveRegion-"]')).toBeAttached();
}

async function openProject(page: Page, name: string) {
  await page.goto("/projets");
  const href = await page.locator("a", { hasText: name }).first().getAttribute("href");
  // Le lien de la carte projet peut viser une sous-page : on garde /projets/<id>.
  await page.goto(href!.split("?")[0].split("/").slice(0, 3).join("/"));
  await expect(column(page, "Terminé")).toBeVisible();
  await ready(page);
}

/** Centre de la colonne cible : là où l'on lâche naturellement une carte dans une colonne vide. */
async function center(target: Locator) {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragWithMouse(page: Page, from: Locator, to: Locator) {
  const box = (await from.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const end = await center(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y + 10, { steps: 5 }); // seuil d'activation (6 px)
  await page.mouse.move(end.x, end.y, { steps: 25 });
  await page.mouse.up();
}

async function dragWithTouch(page: Page, from: Locator, to: Locator) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const box = (await from.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const end = await center(to);
  await touch("touchStart", start.x, start.y);
  await page.waitForTimeout(300); // appui long : délai d'activation du TouchSensor (200 ms)
  for (let i = 1; i <= 25; i++) await touch("touchMove", start.x + ((end.x - start.x) * i) / 25, start.y + ((end.y - start.y) * i) / 25);
  await touch("touchEnd");
}

const STATUS_OF: Record<Column, string> = { "À faire": "todo", "En cours": "in_progress", Terminé: "done" };

/**
 * Glisse, vérifie le statut envoyé au serveur (requête de l'action moveTask), recharge et vérifie
 * que la carte est restée dans `to`.
 */
async function moveAndCheck(page: Page, title: string, from: Column, to: Column, input: "mouse" | "touch" = "mouse") {
  const request = page
    .waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"], { timeout: 5_000 })
    .catch(() => null);
  await (input === "touch" ? dragWithTouch : dragWithMouse)(page, card(page, from, title), column(page, to));
  const sent = await request;
  expect(sent, `aucun enregistrement envoyé après le dépôt de « ${title} » dans « ${to} »`).not.toBeNull();
  expect(sent!.postData(), "statut envoyé au serveur").toContain(`"${STATUS_OF[to]}"`);
  await sent!.response();
  await expect(card(page, to, title)).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(card(page, to, title), "après rechargement").toBeVisible();
  await expect(card(page, from, title)).toHaveCount(0);
}

// Aucune erreur React (ex. « Maximum update depth exceeded ») pendant les glisser-déposer.
let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await login(page);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("vers « Terminé » vide depuis « À faire »", async ({ page }) => {
  await openProject(page, PROJECTS.empty.name);
  await expect(column(page, "Terminé").locator("[aria-roledescription=sortable]")).toHaveCount(0);
  await moveAndCheck(page, "Racine à terminer", "À faire", "Terminé");
  await moveAndCheck(page, "En cours à terminer", "En cours", "Terminé");
});

test("vers « Terminé » déjà remplie depuis « À faire » et « En cours »", async ({ page }) => {
  await openProject(page, PROJECTS.filled.name);
  await moveAndCheck(page, "Racine vers rempli", "À faire", "Terminé");
  await moveAndCheck(page, "En cours vers rempli", "En cours", "Terminé");
});

// Colonnes courtes et « Terminé » vide : avant correction, la carte faisait des allers-retours entre
// « En cours » et « Terminé » jusqu'à « Maximum update depth exceeded » (page plantée).
test("vers « Terminé » vide avec des colonnes courtes (racine puis sous-tâche)", async ({ page }) => {
  await openProject(page, PROJECTS.short.name);
  await expect(column(page, "Terminé").locator("[aria-roledescription=sortable]")).toHaveCount(0);
  await moveAndCheck(page, "Racine courte", "À faire", "Terminé");
  await moveAndCheck(page, "Sous-tâche en cours", "En cours", "Terminé");
});

test("tâche parente et sous-tâche vers « Terminé »", async ({ page }) => {
  await openProject(page, PROJECTS.subtasks.name);
  await moveAndCheck(page, "Sous-tâche B", "En cours", "Terminé");
  await moveAndCheck(page, "Parente", "À faire", "Terminé");
});

test("retour de « Terminé » vers « À faire » et « En cours »", async ({ page }) => {
  await openProject(page, PROJECTS.back.name);
  await moveAndCheck(page, "Finie à rouvrir", "Terminé", "À faire");
  await moveAndCheck(page, "Finie à rouvrir", "À faire", "Terminé");
  await moveAndCheck(page, "Finie à rouvrir", "Terminé", "En cours");
});

test("échec de l'enregistrement : message d'erreur et carte remise en place", async ({ page }) => {
  await openProject(page, PROJECTS.failure.name);
  // Coupe l'appel au serveur (réseau perdu) : avant, la carte restait affichée dans « Terminé »
  // sans être enregistrée, sans aucun message.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort("internetdisconnected") : route.fallback(),
  );
  await dragWithMouse(page, card(page, "À faire", "Non enregistrée"), column(page, "Terminé"));
  await expect(page.getByText("Déplacement non enregistré : vérifiez votre connexion puis réessayez.")).toBeVisible();
  await expect(card(page, "À faire", "Non enregistrée")).toBeVisible();
  await expect(card(page, "Terminé", "Non enregistrée")).toHaveCount(0);
  await page.unroute("**/*");
  await page.reload();
  await expect(card(page, "À faire", "Non enregistrée")).toBeVisible();
});

test.describe("écran tactile", () => {
  test.use({ hasTouch: true });

  test("vers « Terminé » vide au doigt", async ({ page }) => {
    await openProject(page, PROJECTS.touch.name);
    await moveAndCheck(page, "Au doigt", "À faire", "Terminé", "touch");
  });
});
