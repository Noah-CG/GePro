import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownDocument } from "./markdown-document";

const render = (markdown: string) => renderToStaticMarkup(<MarkdownDocument markdown={markdown} />);

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("MarkdownDocument", () => {
  it("met en forme titres, gras, listes et tableaux", () => {
    const html = render("# Titre\n\nTexte **important**.\n\n- un\n- deux\n\n| A | B |\n|---|---|\n| 1 | 2 |\n");
    expect(html).toContain("<h1>Titre</h1>");
    expect(html).toContain("<strong>important</strong>");
    expect(html).toContain("<li>deux</li>");
    expect(html).toContain('<div class="doc-table"><table>');
    expect(html).toContain("<td>2</td>");
  });

  it("n'interprète jamais le HTML contenu dans le document", () => {
    const html = render('Avant <script>alert(1)</script> <img src="x" onerror="alert(1)"> après');
    // Le HTML reste du texte affiché tel quel, échappé : aucune balise n'est créée.
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("neutralise les liens dangereux et ouvre les autres dans un nouvel onglet", () => {
    const html = render("[piège](javascript:alert(1)) et [site](https://exemple.fr)");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://exemple.fr" target="_blank" rel="noopener noreferrer"');
  });

  it("affiche les images intégrées par Google (base64), mais pas le SVG ni les liens data:", () => {
    const html = render(`![schéma][image1]\n\n[lien](data:text/html;base64,PHNjcmlwdD4=)\n\n![svg](data:image/svg+xml;base64,PHN2Zz4=)\n\n[image1]: <${PNG}>\n`);
    expect(html).toContain(`src="${PNG}"`);
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("data:image/svg");
  });
});
