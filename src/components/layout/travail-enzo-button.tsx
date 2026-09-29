"use client";

import * as Popover from "@radix-ui/react-popover";
import { Megaphone, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { tabShape } from "@/components/discord/discord-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Phrase toujours proposée, qu'on ne peut pas retirer. */
const DEFAULT_PHRASE = "Travail, Enzo !";
/** Phrases ajoutées, gardées dans ce navigateur seulement. */
const STORAGE_KEY = "gepro:cris";
const MAX_PHRASES = 8;
const MAX_LENGTH = 100;

/** Phrases enregistrées (public/audio) : jouées telles quelles, les autres passent par la synthèse vocale. */
const RECORDINGS: Record<string, string> = { [DEFAULT_PHRASE]: "/audio/travail-enzo.mp3" };

/** Enregistrement en cours de lecture, arrêté si on crie autre chose. */
let playing: HTMLAudioElement | null = null;

/** Crie la phrase : son enregistrement s'il y en a un, sinon la synthèse vocale du navigateur. */
function shout(phrase: string) {
  // Un nouveau clic relance le cri au lieu de l'empiler derrière le précédent.
  playing?.pause();
  playing = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();

  const recording = RECORDINGS[phrase];
  if (recording) {
    const audio = new Audio(recording);
    playing = audio;
    // Fichier introuvable ou lecture refusée : la synthèse vocale prend le relais.
    audio.play().catch(() => playing === audio && speak(phrase));
  } else {
    speak(phrase);
  }
}

function speak(phrase: string) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = "fr-FR";
  utterance.voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr")) ?? null;
  // Plus fort, plus vite et plus aigu qu'une lecture normale : ça sonne comme un cri.
  utterance.volume = 1;
  utterance.rate = 1.15;
  utterance.pitch = 1.4;
  speechSynthesis.speak(utterance);
}

/**
 * Onglet fixe à gauche de celui de Discord : ouvre la liste des phrases à crier (« Travail, Enzo ! »
 * et celles qu'on ajoute). Un clic sur une phrase la crie.
 */
export function TravailEnzoButton() {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  // Relues à chaque ouverture : à jour même si un autre onglet les a modifiées.
  function load(open: boolean) {
    if (!open) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setPhrases(saved.filter((p): p is string => typeof p === "string").slice(0, MAX_PHRASES));
    } catch {}
  }

  function save(next: string[]) {
    setPhrases(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const phrase = draft.trim().replace(/\s+/g, " ");
    if (!phrase) return;
    shout(phrase);
    setDraft("");
    // La plus récente en tête, sans doublon ; « Travail, Enzo ! » est déjà toujours proposée.
    if (phrase !== DEFAULT_PHRASE) save([phrase, ...phrases.filter((p) => p !== phrase)].slice(0, MAX_PHRASES));
  }

  return (
    <>
      <span aria-hidden className="mr-1 mb-2 h-4 w-px shrink-0 self-end bg-border" />
      <Popover.Root onOpenChange={load}>
        <Popover.Trigger
          aria-label="Crier une phrase"
          title="Crier une phrase"
          className={cn(tabShape, "border-transparent text-muted hover:bg-surface-2 hover:text-accent data-[state=open]:border-border data-[state=open]:bg-surface data-[state=open]:text-accent")}
        >
          <Megaphone size={16} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            className="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-1 shadow-xl"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-xs text-muted">Cliquez sur une phrase pour la crier</p>
            <ul className="max-h-64 overflow-y-auto">
              {[DEFAULT_PHRASE, ...phrases].map((phrase) => (
                <li key={phrase} className="flex items-center rounded-lg hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => shout(phrase)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm"
                  >
                    <Megaphone size={14} className="shrink-0 text-muted" />
                    <span className="truncate">{phrase}</span>
                  </button>
                  {phrase !== DEFAULT_PHRASE && (
                    <button
                      type="button"
                      onClick={() => save(phrases.filter((p) => p !== phrase))}
                      aria-label={`Retirer « ${phrase} »`}
                      title="Retirer"
                      className="mr-1 rounded-md p-1 text-muted hover:bg-surface hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={submit} className="mt-1 flex gap-2 border-t border-border p-1.5 pt-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_LENGTH}
                placeholder="Nouvelle phrase…"
                aria-label="Nouvelle phrase à crier"
                className="h-8"
              />
              <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>
                Crier
              </Button>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
