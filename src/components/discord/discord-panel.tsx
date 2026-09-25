"use client";

import { ExternalLink, SquareArrowOutUpRight, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useTabs } from "@/components/layout/tabs";
import { Button } from "@/components/ui/button";
import type { DiscordChannelView } from "@/lib/discord/model";
import { channelUrl } from "@/lib/discord/urls";
import { cn } from "@/lib/utils";
import { DiscordConversation } from "./discord-conversation";

export const DISCORD_PANEL_ID = "panneau-discord";

/** Largeur du panneau (px) : par défaut, bornes, pas au clavier. */
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
/** Espace toujours laissé à la page, à gauche du panneau. */
const PAGE_MARGIN = 240;
const KEY_STEP = 32;
const WIDTH_STORAGE_KEY = "gepro:discord:largeur";

const maxWidth = () => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - PAGE_MARGIN));
const clampWidth = (w: number) => Math.round(Math.min(Math.max(w, MIN_WIDTH), maxWidth()));

function readStoredWidth(): number {
  try {
    const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function storeWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Stockage indisponible (navigation privée…) : la largeur dure le temps de la session.
  }
}

/**
 * Panneau latéral droit du salon Discord : superposé à la page sans l'assombrir, plein écran sur
 * mobile. Sa largeur se règle en tirant son bord gauche (mémorisée dans ce navigateur). Il reste
 * monté une fois ouvert, pour retrouver messages et position ; fermé, il est inerte et en veille.
 */
export function DiscordPanel({
  projectId,
  channel,
  open,
  onClose,
  onSeen,
}: {
  projectId: string;
  channel: DiscordChannelView;
  open: boolean;
  onClose: () => void;
  onSeen: (messageId: string) => void;
}) {
  const { showInTab } = useTabs();
  // Monté au premier clic seulement : localStorage est lisible dès le premier rendu.
  const [width, setWidth] = useState(readStoredWidth);
  const [resizing, setResizing] = useState(false);

  // Échap ferme le panneau, sauf si une fenêtre modale est ouverte par-dessus (elle se ferme d'abord).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Fenêtre rétrécie : le panneau laisse toujours de la place à la page.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Pendant le glissement : curseur de redimensionnement et pas de sélection de texte, sur toute la page.
  useEffect(() => {
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [resizing]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (resizing) setWidth(clampWidth(window.innerWidth - e.clientX));
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!resizing) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setResizing(false);
    storeWidth(width);
  }

  function resizeTo(next: number) {
    const w = clampWidth(next);
    setWidth(w);
    storeWidth(w);
  }

  function onHandleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Poignée à gauche : ← élargit le panneau, → le rétrécit.
    if (e.key === "ArrowLeft") resizeTo(width + KEY_STEP);
    else if (e.key === "ArrowRight") resizeTo(width - KEY_STEP);
    else if (e.key === "Home") resizeTo(MAX_WIDTH);
    else if (e.key === "End") resizeTo(MIN_WIDTH);
    else return;
    e.preventDefault();
  }

  function openInTab() {
    showInTab(`/projets/${projectId}/discord`, "end");
    onClose();
  }

  return (
    <aside
      id={DISCORD_PANEL_ID}
      aria-label={`Discord, salon #${channel.channelName}`}
      inert={!open}
      style={{ "--discord-panel-width": `${width}px` } as CSSProperties}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-surface shadow-2xl md:w-(--discord-panel-width)",
        !resizing && "transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none",
        open ? "visible translate-x-0" : "invisible translate-x-full",
      )}
    >
      {/* Poignée de redimensionnement (ordinateur) : glisser, flèches, double-clic pour la largeur par défaut. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner le panneau Discord"
        aria-controls={DISCORD_PANEL_ID}
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => resizeTo(DEFAULT_WIDTH)}
        onKeyDown={onHandleKeyDown}
        title="Tirer pour redimensionner (double-clic : largeur par défaut)"
        className="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none focus-visible:outline-none md:block"
      >
        <span
          className={cn(
            "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-accent group-focus-visible:bg-accent",
            resizing && "bg-accent",
          )}
        />
      </div>

      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border pr-2 pl-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          <span className="text-muted">#</span>
          {channel.channelName}
        </h2>
        <a
          href={channelUrl(channel.guildId, channel.channelId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
        >
          Ouvrir dans Discord <ExternalLink size={12} aria-hidden />
        </a>
        <Button variant="ghost" size="icon" onClick={openInTab} aria-label="Ouvrir dans un onglet" title="Ouvrir dans un onglet GePro">
          <SquareArrowOutUpRight size={15} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer le panneau Discord">
          <X size={16} />
        </Button>
      </header>

      <DiscordConversation projectId={projectId} channel={channel} active={open} onSeen={onSeen} />
    </aside>
  );
}
