"use client";

import { Globe } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { iconColors } from "@/lib/links/colors";
import { faviconUrl, isFaviconPlaceholder, type DetectedLink } from "@/lib/links/detect";
import { cn } from "@/lib/utils";

/**
 * Icône d'un lien utile, déduite de son adresse (rien n'est stocké) :
 * 1. le logo du service reconnu (simple-icons), dans sa couleur officielle, ou la couleur du
 *    texte si elle se confond avec le fond (voir lib/links/colors.ts) ;
 * 2. sinon le favicon du site, chargé par le navigateur depuis DuckDuckGo ;
 * 3. si le favicon ne charge pas, un globe.
 * Décorative : le titre du lien l'accompagne toujours.
 */
export function LinkIcon({ link, size = 16, className }: { link: DetectedLink | null; size?: number; className?: string }) {
  const box = cn("inline-flex shrink-0 items-center justify-center", className);

  if (link?.service) {
    const { light, dark } = iconColors(link.service.icon.hex);
    return (
      <span
        aria-hidden
        className={cn(box, "text-[color:var(--link-icon-light)] dark:text-[color:var(--link-icon-dark)]")}
        style={{ "--link-icon-light": light, "--link-icon-dark": dark } as CSSProperties}
      >
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
          <path d={link.service.icon.path} />
        </svg>
      </span>
    );
  }
  if (link) return <Favicon key={link.domain} domain={link.domain} size={size} className={box} />;
  return (
    <span aria-hidden className={box}>
      <Globe size={size} />
    </span>
  );
}

function Favicon({ domain, size, className }: { domain: string; size: number; className: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  const check = (el: HTMLImageElement | null) => {
    if (el?.complete && (el.naturalWidth === 0 || isFaviconPlaceholder(el.naturalWidth, el.naturalHeight))) setFailed(true);
  };
  // Une image chargée (ou en erreur) avant l'hydratation ne déclenche ni `onLoad` ni `onError`.
  useEffect(() => check(img.current), []);

  return (
    <span aria-hidden className={className}>
      {failed ? (
        <Globe size={size} />
      ) : (
        // <img> et non next/image : rien à optimiser, et aucune requête ne passe par le serveur.
        <img
          ref={img}
          src={faviconUrl(domain)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(e) => check(e.currentTarget)}
          onError={() => setFailed(true)}
          className="rounded-sm"
        />
      )}
    </span>
  );
}
