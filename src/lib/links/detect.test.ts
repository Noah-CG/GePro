import * as simpleIcons from "simple-icons";
import { describe, expect, it } from "vitest";
import { contrastRatio, iconColors } from "./colors";
import { defaultLinkTitle, detectLink, faviconUrl, normalizeLinkUrl } from "./detect";
import { LINK_SERVICES } from "./registry";

const serviceOf = (input: string) => detectLink(input)?.service?.key ?? null;

describe("reconnaissance du service", () => {
  it.each([
    ["https://github.com/gepro/gepro", "github"],
    ["github.com/gepro/gepro/pull/12", "github"],
    ["https://gist.github.com/camille/abc123", "github"],
    ["https://www.figma.com/design/AbC/Maquettes", "figma"],
    ["https://WWW.Figma.COM/file/xyz", "figma"],
    ["https://gepro-git-main.vercel.app", "vercel"],
    ["https://vercel.com/equipe/gepro", "vercel"],
    ["https://monequipe.atlassian.net/browse/GP-42", "jira"],
    ["https://monequipe.atlassian.net/wiki/spaces/GP/overview", "confluence"],
    ["https://docs.google.com/document/d/1AbC/edit", "google-docs"],
    ["https://docs.google.com/spreadsheets/d/1AbC/edit#gid=0", "google-sheets"],
    ["https://docs.google.com/presentation/d/1AbC/edit", "google-slides"],
    ["https://docs.google.com/forms/d/e/1AbC/viewform", "google-forms-docs"],
    ["https://forms.gle/AbCdEf", "google-forms"],
    ["https://drive.google.com/drive/folders/1AbC", "google-drive"],
    ["https://meet.google.com/abc-defg-hij", "google-meet"],
    ["https://www.google.com/maps/place/Paris", "google-maps-path"],
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://discord.gg/abcd", "discord"],
    ["https://gepro.notion.site/Roadmap-123", "notion"],
    ["https://www.notion.so/gepro/Specs-456", "notion"],
    ["https://twitter.com/gepro", "x"],
    ["https://fr.wikipedia.org/wiki/Diagramme_de_Gantt", "wikipedia"],
    ["https://mon-projet.supabase.co", "supabase"],
    ["https://firebase.google.com/docs", "firebase"],
    ["claude.ai/chat/123", "claude"],
  ])("%s → %s", (url, key) => {
    expect(serviceOf(url)).toBe(key);
  });

  it("ne reconnaît pas un domaine qui ne fait que ressembler", () => {
    expect(serviceOf("https://notgithub.com/x")).toBeNull();
    expect(serviceOf("https://github.com.evil.fr/x")).toBeNull();
    expect(serviceOf("https://docs.google.com.evil.fr/document/d/1")).toBeNull();
  });

  it("ne reconnaît pas un chemin qui ne fait que commencer pareil", () => {
    expect(serviceOf("https://docs.google.com/documents-old/1")).toBe("google-drive");
    expect(serviceOf("https://monequipe.atlassian.net/wikipedia")).toBe("jira");
  });

  it("laisse les sites inconnus au favicon", () => {
    expect(serviceOf("https://exemple.fr/page")).toBeNull();
    // Canva, Slack, LinkedIn… ont été retirés de simple-icons (droit des marques).
    expect(serviceOf("https://www.canva.com/design/abc")).toBeNull();
    expect(serviceOf("https://gepro.slack.com")).toBeNull();
  });
});

describe("normalisation de l'adresse", () => {
  it("ajoute https:// et passe le domaine en minuscules", () => {
    expect(detectLink("Exemple.FR/Chemin?q=A")).toMatchObject({ href: "https://exemple.fr/Chemin?q=A", domain: "exemple.fr" });
    expect(detectLink("  www.exemple.fr  ")).toMatchObject({ href: "https://www.exemple.fr/", domain: "exemple.fr" });
    expect(detectLink("localhost:3000/projets")?.href).toBe("https://localhost:3000/projets");
  });

  it("garde http:// quand il est donné", () => {
    expect(detectLink("http://intranet.local/wiki")?.href).toBe("http://intranet.local/wiki");
  });

  it.each([
    "",
    "   ",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:camille@exemple.fr",
    "ftp://exemple.fr/fichier",
    "file:///etc/passwd",
    "https://",
    "https://github.com@evil.fr/",
    "https://user:mdp@exemple.fr/",
    "http://exa mple.fr",
  ])("refuse %j", (input) => {
    expect(normalizeLinkUrl(input)).toBeNull();
  });
});

describe("titre par défaut et favicon", () => {
  it("prend le nom du service, sinon le domaine", () => {
    expect(defaultLinkTitle(detectLink("https://www.figma.com/file/1")!)).toBe("Figma");
    expect(defaultLinkTitle(detectLink("https://www.exemple.fr/page")!)).toBe("exemple.fr");
  });

  it("demande le favicon au service public, par domaine", () => {
    expect(faviconUrl("exemple.fr")).toBe("https://icons.duckduckgo.com/ip3/exemple.fr.ico");
  });
});

describe("registre", () => {
  it("n'utilise que des icônes présentes dans la version installée de simple-icons", () => {
    const available = new Set(Object.values(simpleIcons).map((icon) => icon.slug));
    for (const service of LINK_SERVICES) expect(available.has(service.icon.slug), service.key).toBe(true);
  });

  it("a des clés uniques et des domaines normalisés", () => {
    const keys = LINK_SERVICES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of LINK_SERVICES) {
      for (const d of s.match) expect(d, s.key).toMatch(/^(?!www\.)[a-z0-9.-]+\.[a-z]+$/);
    }
  });
});

describe("couleur des logos", () => {
  it("calcule le contraste WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("ffffff", "ffffff")).toBe(1);
  });

  it("garde la couleur officielle quand elle se voit", () => {
    expect(iconColors("F24E1E")).toEqual({ light: "#F24E1E", dark: "#F24E1E" }); // Figma
  });

  it("bascule sur la couleur du texte quand le logo se confond avec le fond", () => {
    expect(iconColors("181717")).toEqual({ light: "#181717", dark: "currentColor" }); // GitHub
    expect(iconColors("FAFAFA")).toEqual({ light: "currentColor", dark: "#FAFAFA" }); // tldraw
  });
});
