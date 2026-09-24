"use client";

import { AlertTriangle, Minus, MoveHorizontal, Plus } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy, TextLayer } from "pdfjs-dist";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHUNK_SIZE } from "@/lib/files";

type PdfJs = typeof import("pdfjs-dist");

/** Zoom 100 % = taille réelle : le PDF compte en points (72 par pouce), l'écran en pixels CSS (96). */
const CSS_UNITS = 96 / 72;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Pages dessinées à l'avance autour de l'écran ; au-delà, leur image est libérée (mémoire). */
const RENDER_MARGIN = "150% 0px";
/** Au-delà de ce nombre de pixels, une page est dessinée moins finement (mémoire du navigateur). */
const MAX_CANVAS_PIXELS = 16_000_000;
/** Marge horizontale laissée autour d'une page ajustée à la largeur. */
const PAGE_GUTTER = 2;
/** Ligne de lecture (en px depuis le haut de l'écran, sous les barres fixes) : sert au zoom. */
const READING_LINE = 140;

/** Zoom qui fait tenir une page de `width` points dans `available` pixels (entre 50 % et 200 %). */
function fitToWidth(width: number, available: number): number {
  return Math.min(Math.max((available - PAGE_GUTTER) / width, ZOOM_STEPS[0] * CSS_UNITS), 2 * CSS_UNITS);
}

let pdfjsPromise: Promise<PdfJs> | null = null;

/** pdf.js n'est chargé qu'à l'ouverture d'un premier PDF : il pèse plusieurs centaines de Ko. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then(
    (pdfjs) => {
      // Le PDF est décodé dans un Web Worker, sans bloquer la page.
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), {
        type: "module",
      });
      return pdfjs;
    },
    (e) => {
      pdfjsPromise = null;
      throw e;
    },
  );
  return pdfjsPromise;
}

function loadErrorMessage(e: unknown): string {
  const { name, status } = (e ?? {}) as { name?: string; status?: number };
  if (name === "PasswordException") return "Ce PDF est protégé par un mot de passe : téléchargez-le pour l'ouvrir.";
  if (name === "InvalidPDFException") return "Ce fichier est endommagé ou n'est pas un PDF valide.";
  if (status === 401) return "Votre session a expiré : reconnectez-vous pour lire ce document.";
  if (status === 404) return "Ce fichier n'existe plus.";
  return "Impossible d'afficher ce PDF. Rechargez la page, ou téléchargez le fichier.";
}

type Loaded = {
  pdfjs: PdfJs;
  doc: PDFDocumentProxy;
  /** Taille de la première page, en points : sert aux pages pas encore chargées et à l'ajustement. */
  pageSize: { width: number; height: number };
};

/**
 * Lecteur PDF de GePro, sans iframe : pdf.js dessine chaque page (texte, images, mise en page)
 * dans un canvas, sous un calque de texte transparent qui permet de sélectionner, copier et
 * rechercher le texte. Seules les pages proches de l'écran sont téléchargées et dessinées.
 */
export function PdfViewer({ src }: { src: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | "largeur">("largeur");
  const [availableWidth, setAvailableWidth] = useState(0);
  const [nearPages, setNearPages] = useState<ReadonlySet<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ page: number; ratio: number } | null>(null);
  const pageInputId = useId();

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<PdfJs["getDocument"]> | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        // Adresses absolues : le worker ne résout pas les chemins par rapport à la page.
        const assets = new URL(`/api/pdfjs/${pdfjs.version}/`, window.location.origin).href;
        task = pdfjs.getDocument({
          url: new URL(src, window.location.origin).href,
          // Téléchargement à la demande, par plages alignées sur les morceaux stockés en base.
          rangeChunkSize: CHUNK_SIZE,
          disableStream: true,
          disableAutoFetch: true,
          cMapUrl: `${assets}cmaps/`,
          standardFontDataUrl: `${assets}standard_fonts/`,
          wasmUrl: `${assets}wasm/`,
          iccUrl: `${assets}iccs/`,
        });
        const doc = await task.promise;
        const { width, height } = (await doc.getPage(1)).getViewport({ scale: 1 });
        if (!cancelled) setLoaded({ pdfjs, doc, pageSize: { width, height } });
      } catch (e) {
        if (!cancelled) setError(loadErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [src]);

  // Largeur disponible, pour l'ajustement à la largeur.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(Math.floor(entry.contentRect.width)));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // « Largeur » : chaque page est ajustée à la largeur (une page paysage aussi) ; le zoom affiché
  // est celui de la première page.
  const fitWidth = zoom === "largeur" && availableWidth > 0 ? availableWidth : null;
  const scale = zoom === "largeur" ? (loaded && fitWidth ? fitToWidth(loaded.pageSize.width, fitWidth) : CSS_UNITS) : zoom * CSS_UNITS;
  const factor = scale / CSS_UNITS;

  // Pages proches de l'écran (à télécharger et dessiner) et page en cours de lecture.
  useEffect(() => {
    const container = pagesRef.current;
    if (!container || !loaded) return;
    const pageOf = (el: Element) => Number((el as HTMLElement).dataset.page);
    const near = new IntersectionObserver(
      (entries) =>
        setNearPages((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            if (e.isIntersecting) next.add(pageOf(e.target));
            else next.delete(pageOf(e.target));
          }
          return next;
        }),
      { rootMargin: RENDER_MARGIN },
    );
    // Bande fine au premier tiers de l'écran : la page qui la traverse est la page en cours.
    const reading = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCurrentPage(pageOf(e.target))),
      { rootMargin: "-30% 0px -69% 0px" },
    );
    for (const el of container.querySelectorAll("[data-page]")) {
      near.observe(el);
      reading.observe(el);
    }
    return () => {
      near.disconnect();
      reading.disconnect();
    };
  }, [loaded]);

  const pageElement = (page: number) => pagesRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`) ?? null;

  /** Change le zoom en gardant sous les yeux le même endroit de la page lue. */
  function changeZoom(next: number | "largeur") {
    const el = pageElement(currentPage);
    if (el) {
      const rect = el.getBoundingClientRect();
      anchor.current = { page: currentPage, ratio: (READING_LINE - rect.top) / rect.height };
    }
    setZoom(next);
  }

  useLayoutEffect(() => {
    const target = anchor.current;
    anchor.current = null;
    const el = target && pageElement(target.page);
    if (!target || !el) return;
    const rect = el.getBoundingClientRect();
    window.scrollBy(0, rect.top + target.ratio * rect.height - READING_LINE);
  }, [scale]);

  const zoomIn = () => changeZoom(ZOOM_STEPS.find((s) => s > factor + 0.01) ?? ZOOM_STEPS.at(-1)!);
  const zoomOut = () => changeZoom([...ZOOM_STEPS].reverse().find((s) => s < factor - 0.01) ?? ZOOM_STEPS[0]);

  function goToPage(e: FormEvent) {
    e.preventDefault();
    const total = loaded?.doc.numPages ?? 1;
    const page = Math.min(Math.max(Math.round(Number(pageDraft)) || currentPage, 1), total);
    setPageDraft(null);
    pageElement(page)?.scrollIntoView({ block: "start" });
  }

  if (error) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>{error}</p>
      </div>
    );
  }

  const total = loaded?.doc.numPages ?? 0;
  return (
    <div ref={rootRef}>
      <div
        role="toolbar"
        aria-label="Lecture du PDF"
        className="sticky top-24 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface/95 px-2 py-1 backdrop-blur md:top-10"
      >
        <form onSubmit={goToPage} className="flex items-center gap-1.5 text-sm">
          <label htmlFor={pageInputId} className="text-muted">
            Page
          </label>
          <span className="w-12">
            <Input
              id={pageInputId}
              inputMode="numeric"
              disabled={!loaded}
              value={pageDraft ?? String(currentPage)}
              onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setPageDraft(null)}
              onFocus={(e) => e.target.select()}
              className="h-7 px-1 text-center tabular-nums"
            />
          </span>
          <span className="text-muted tabular-nums">/ {total || "…"}</span>
        </form>
        <div role="group" aria-label="Zoom" className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" onClick={zoomOut} disabled={!loaded || factor <= ZOOM_STEPS[0] + 0.01} aria-label="Zoom arrière">
            <Minus size={15} />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums" aria-live="polite">
            {Math.round(factor * 100)} %
          </span>
          <Button size="icon" variant="ghost" onClick={zoomIn} disabled={!loaded || factor >= ZOOM_STEPS.at(-1)! - 0.01} aria-label="Zoom avant">
            <Plus size={15} />
          </Button>
          <Button
            size="sm"
            variant={zoom === "largeur" ? "secondary" : "ghost"}
            onClick={() => changeZoom("largeur")}
            disabled={!loaded}
            aria-pressed={zoom === "largeur"}
            title="Ajuster à la largeur"
          >
            <MoveHorizontal size={15} /> <span className="hidden sm:inline">Largeur</span>
          </Button>
        </div>
      </div>

      {loaded ? (
        <div ref={pagesRef} className="flex flex-col gap-4 overflow-x-auto pb-2">
          {Array.from({ length: total }, (_, i) => (
            <PdfPage
              key={i}
              loaded={loaded}
              number={i + 1}
              total={total}
              baseScale={scale}
              fitWidth={fitWidth}
              near={nearPages.has(i + 1)}
            />
          ))}
        </div>
      ) : (
        <div className="mx-auto aspect-[1/1.414] w-full max-w-3xl animate-pulse rounded-sm bg-surface-2" aria-busy="true" aria-label="Chargement du PDF" />
      )}
    </div>
  );
}

type PageLink = { url: string; left: number; top: number; width: number; height: number };

function PdfPage({
  loaded,
  number,
  total,
  baseScale,
  fitWidth,
  near,
}: {
  loaded: Loaded;
  number: number;
  total: number;
  /** Zoom du document (celui de la première page en mode « Largeur »). */
  baseScale: number;
  /** Mode « Largeur » : largeur disponible, à laquelle la page s'ajuste une fois chargée. */
  fitWidth: number | null;
  near: boolean;
}) {
  const { pdfjs, doc, pageSize } = loaded;
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const scale = page && fitWidth ? fitToWidth(page.getViewport({ scale: 1 }).width, fitWidth) : baseScale;
  const [links, setLinks] = useState<PageLink[]>([]);
  const [drawn, setDrawn] = useState(false);
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const textLayer = useRef<TextLayer | null>(null);
  // Zoom au moment où le calque de texte est créé (il suit ensuite les changements).
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Page chargée à sa première approche, puis gardée (quelques Ko).
  useEffect(() => {
    if (!near || page) return;
    let cancelled = false;
    doc.getPage(number).then(
      (p) => !cancelled && setPage(p),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [near, page, doc, number]);

  // Calque de texte et liens : créés une fois, ils suivent ensuite le zoom.
  useEffect(() => {
    const container = textHost.current;
    if (!page || !container) return;
    const layer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container,
      viewport: page.getViewport({ scale: scaleRef.current }),
    });
    textLayer.current = layer;
    layer.render().catch(() => {});

    let cancelled = false;
    page.getAnnotations({ intent: "display" }).then(
      (annotations) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const percent = (value: number, of: number) => (100 * value) / of;
        setLinks(
          annotations
            // pdf.js ne renseigne `url` que pour des adresses sûres ; on s'en tient aux liens web et e-mail.
            .filter((a) => a.subtype === "Link" && typeof a.url === "string" && /^(https?|mailto):/i.test(a.url))
            .map((a) => {
              const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
              const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
              return {
                url: a.url as string,
                left: percent(Math.min(x1, x2), viewport.width),
                top: percent(Math.min(y1, y2), viewport.height),
                width: percent(Math.abs(x2 - x1), viewport.width),
                height: percent(Math.abs(y2 - y1), viewport.height),
              };
            }),
        );
      },
      () => {},
    );
    return () => {
      cancelled = true;
      layer.cancel();
      container.replaceChildren();
      textLayer.current = null;
    };
  }, [page, pdfjs]);

  useEffect(() => {
    if (page) textLayer.current?.update({ viewport: page.getViewport({ scale }) });
  }, [page, scale]);

  // Image de la page : dessinée près de l'écran, libérée au loin. Pendant un changement de zoom,
  // l'ancienne image reste affichée (étirée) jusqu'à ce que la nouvelle soit prête.
  useEffect(() => {
    const host = canvasHost.current;
    if (!page || !host) return;
    if (!near) {
      releaseCanvases(host);
      setDrawn(false);
      return;
    }
    const viewport = page.getViewport({ scale });
    const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.className = "absolute inset-0 h-full w-full";
    const task = page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
    task.promise.then(
      () => {
        releaseCanvases(host);
        host.append(canvas);
        setDrawn(true);
      },
      // Rendu annulé (zoom, page éloignée) ou page illisible : rien à afficher.
      () => {},
    );
    return () => task.cancel();
  }, [page, near, scale]);

  const viewport = page?.getViewport({ scale });
  const style = {
    width: viewport ? viewport.width : pageSize.width * baseScale,
    height: viewport ? viewport.height : pageSize.height * baseScale,
    "--scale-factor": scale,
    "--user-unit": page?.userUnit ?? 1,
  } as CSSProperties;

  return (
    <section
      data-page={number}
      aria-label={`Page ${number} sur ${total}`}
      className="pdf-page relative mx-auto shrink-0 scroll-mt-40 bg-white shadow-sm ring-1 ring-black/10 md:scroll-mt-24"
      style={style}
    >
      {!drawn && (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400" aria-hidden>
          {number}
        </span>
      )}
      <div ref={canvasHost} className="absolute inset-0" aria-hidden />
      <div ref={textHost} className="textLayer" />
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.url}
          aria-label={`Lien : ${link.url}`}
          className="absolute z-[2] rounded-sm hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
          style={{ left: `${link.left}%`, top: `${link.top}%`, width: `${link.width}%`, height: `${link.height}%` }}
        />
      ))}
    </section>
  );
}

/** Retire les canvas d'une page en libérant leur mémoire tout de suite (Safari la garde sinon). */
function releaseCanvases(host: HTMLElement) {
  for (const canvas of host.querySelectorAll("canvas")) {
    canvas.width = 0;
    canvas.height = 0;
  }
  host.replaceChildren();
}
