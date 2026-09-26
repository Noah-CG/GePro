import { renderToStaticMarkup } from "react-dom/server";
import { siGithub } from "simple-icons";
import { describe, expect, it } from "vitest";
import { detectLink } from "@/lib/links/detect";
import { LinkIcon } from "./link-icon";

const render = (url: string) => renderToStaticMarkup(<LinkIcon link={detectLink(url)} size={16} />);

describe("LinkIcon", () => {
  it("dessine le logo du service, avec une couleur par thème", () => {
    const html = render("https://github.com/gepro/gepro");
    expect(html).toContain(`d="${siGithub.path}"`);
    // Logo quasi noir : couleur officielle en mode clair, couleur du texte en mode sombre.
    expect(html).toContain("--link-icon-light:#181717");
    expect(html).toContain("--link-icon-dark:currentColor");
    expect(html).not.toContain("<img");
  });

  it("affiche le favicon d'un site inconnu, chargé paresseusement par le navigateur", () => {
    const html = render("https://www.exemple.fr/page");
    expect(html).toContain('src="https://icons.duckduckgo.com/ip3/exemple.fr.ico"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });

  it("affiche un globe sans adresse exploitable", () => {
    const html = render("javascript:alert(1)");
    expect(html).toContain("lucide-globe");
    expect(html).not.toContain("<img");
  });
});
