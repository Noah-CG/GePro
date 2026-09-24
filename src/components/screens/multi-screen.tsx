"use client";

import { Maximize, MonitorPlay, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Segmented } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Count = "1" | "2" | "3" | "4";

const STORAGE_KEY = "gepro_screens";

/** Disposition de la grille selon le nombre d'écrans (empilés sur mobile). */
const GRID: Record<Count, string> = {
  "1": "md:grid-cols-1 md:grid-rows-1",
  "2": "md:grid-cols-2 md:grid-rows-1",
  "3": "md:grid-cols-2 md:grid-rows-2",
  "4": "md:grid-cols-2 md:grid-rows-2",
};

/** Même disposition en plein écran, quelle que soit la largeur. */
const GRID_FULL: Record<Count, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2": "grid-cols-2 grid-rows-1",
  "3": "grid-cols-2 grid-rows-2",
  "4": "grid-cols-2 grid-rows-2",
};

/**
 * Extrait l'identifiant d'une vidéo YouTube (et le temps de départ éventuel)
 * à partir d'un lien watch, youtu.be, shorts, live, embed ou d'un identifiant seul.
 */
export function toEmbedUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  if (/^[\w-]{11}$/.test(input)) return `https://www.youtube-nocookie.com/embed/${input}`;

  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)?.[1] ?? null;
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;

  const t = url.searchParams.get("t") ?? url.searchParams.get("start");
  const seconds = t ? parseTime(t) : 0;
  return `https://www.youtube-nocookie.com/embed/${id}${seconds ? `?start=${seconds}` : ""}`;
}

/** "90", "90s" ou "1h2m3s" → secondes. */
function parseTime(t: string): number {
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
}

export function MultiScreen() {
  const [count, setCount] = useState<Count>("2");
  const [links, setLinks] = useState<string[]>(["", "", "", ""]);
  const [full, setFull] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Suit l'entrée / la sortie du plein écran (y compris via Échap).
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === gridRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Sans API plein écran (iPhone), le mode repose sur un calque fixe : Échap le ferme.
  useEffect(() => {
    if (!full || document.fullscreenElement) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  function enterFullscreen() {
    const grid = gridRef.current;
    if (grid?.requestFullscreen) {
      grid.requestFullscreen().catch(() => setFull(true));
    } else {
      setFull(true);
    }
  }

  // Le plein écran natif garde la main, le calque de secours n'a pas de bouton système.
  const fallback = full && typeof document !== "undefined" && !document.fullscreenElement;

  // Restaure la dernière configuration de ce navigateur.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && ["1", "2", "3", "4"].includes(saved.count) && Array.isArray(saved.links)) {
        setCount(saved.count);
        setLinks([0, 1, 2, 3].map((i) => (typeof saved.links[i] === "string" ? saved.links[i] : "")));
      }
    } catch {}
  }, []);

  function save(nextCount: Count, nextLinks: string[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ count: nextCount, links: nextLinks }));
    } catch {}
  }

  function changeCount(c: Count) {
    setCount(c);
    save(c, links);
  }

  function setLink(i: number, value: string) {
    const next = links.map((l, j) => (j === i ? value : l));
    setLinks(next);
    save(count, next);
  }

  const n = Number(count);

  return (
    <div className="flex flex-col md:h-[calc(100dvh-4rem)]">
      <PageHeader
        title="Multi-écran"
        subtitle="Choisissez le nombre d'écrans puis collez un lien YouTube dans chacun."
        actions={
          <>
            <div className="w-56">
              <Segmented
                label="Nombre d'écrans"
                value={count}
                onChange={changeCount}
                options={(["1", "2", "3", "4"] as const).map((v) => ({ value: v, label: v }))}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={enterFullscreen} title="Plein écran (Échap pour quitter)">
              <Maximize size={15} /> Plein écran
            </Button>
          </>
        }
      />

      <div
        ref={gridRef}
        className={cn(
          "grid min-h-0",
          full ? cn("fixed inset-0 z-50 gap-0 bg-black", GRID_FULL[count]) : cn("flex-1 grid-cols-1 gap-3", GRID[count]),
        )}
      >
        {Array.from({ length: n }, (_, i) => (
          <Screen
            key={i}
            index={i}
            link={links[i]}
            onChange={(v) => setLink(i, v)}
            full={full}
            className={count === "3" && i === 2 ? (full ? "col-span-2" : "md:col-span-2") : undefined}
          />
        ))}
        {fallback && (
          <button
            onClick={() => setFull(false)}
            aria-label="Quitter le plein écran"
            className="fixed top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function Screen({
  index,
  link,
  onChange,
  full,
  className,
}: {
  index: number;
  link: string;
  onChange: (v: string) => void;
  full: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(link);
  const [error, setError] = useState(false);
  const embed = toEmbedUrl(link);

  useEffect(() => setDraft(link), [link]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (draft.trim() && !toEmbedUrl(draft)) {
      setError(true);
      return;
    }
    setError(false);
    onChange(draft.trim());
  }

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        full ? "bg-black" : "rounded-xl border border-border bg-surface",
        className,
      )}
    >
      {/* Masqué (et non retiré) en plein écran pour ne pas recharger les vidéos. */}
      <form onSubmit={submit} className={cn("flex items-center gap-2 border-b border-border p-2", full && "hidden")}>
        <span className="w-5 shrink-0 text-center text-xs font-medium text-muted">{index + 1}</span>
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label={`Lien YouTube de l'écran ${index + 1}`}
          aria-invalid={error}
          className={cn("h-8", error && "border-danger focus:border-danger")}
        />
        <Button type="submit" size="sm">
          Afficher
        </Button>
        {link && (
          <Button type="button" size="icon" variant="ghost" aria-label="Retirer la vidéo" onClick={() => onChange("")}>
            <X size={16} />
          </Button>
        )}
      </form>
      {error && !full && <p className="px-3 pt-1.5 text-xs text-danger">Lien YouTube non reconnu.</p>}

      <div className={cn("relative min-h-0 bg-black", full ? "flex-1" : "aspect-video md:aspect-auto md:flex-1")}>
        {embed ? (
          <iframe
            key={embed}
            src={embed}
            title={`Vidéo ${index + 1}`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/50">
            <MonitorPlay size={28} />
            Aucune vidéo
          </div>
        )}
      </div>
    </section>
  );
}
