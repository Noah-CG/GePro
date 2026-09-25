"use client";

import { SendHorizontal } from "lucide-react";
import { forwardRef, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { MESSAGE_MAX_LENGTH } from "@/lib/discord/validation";
import { cn } from "@/lib/utils";

/** Le compteur n'apparaît qu'à l'approche de la limite de Discord. */
const COUNTER_FROM = 1800;
/** Hauteur maximale du champ avant qu'il ne défile (px). */
const MAX_HEIGHT = 200;

/**
 * Zone de saisie : s'agrandit avec le texte, Entrée envoie, Maj+Entrée va à la ligne.
 * Le texte n'est effacé qu'une fois confié à `onSend` (l'envoi, optimiste, est suivi par le fil).
 */
export const Composer = forwardRef<HTMLTextAreaElement, { channelName: string; onSend: (content: string) => void }>(function Composer(
  { channelName, onSend },
  forwardedRef,
) {
  const [value, setValue] = useState("");
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const length = value.length;
  const tooLong = length > MESSAGE_MAX_LENGTH;
  const canSend = value.trim().length > 0 && !tooLong;

  // Hauteur ajustée au contenu à chaque frappe.
  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function send() {
    if (!canSend) return;
    onSend(value);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing : Entrée valide un caractère en cours de saisie (japonais, chinois…), sans envoyer.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="border-t border-border p-3"
    >
      <div className="flex items-end gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/40">
        <textarea
          ref={(el) => {
            localRef.current = el;
            if (typeof forwardedRef === "function") forwardedRef(el);
            else if (forwardedRef) forwardedRef.current = el;
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={`Écrire dans #${channelName}`}
          aria-label={`Message pour #${channelName}`}
          aria-describedby="discord-composer-hint"
          aria-invalid={tooLong || undefined}
          className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent py-0.5 text-sm leading-relaxed placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Envoyer"
          className="mb-0.5 rounded-md p-1 text-accent hover:bg-accent-soft disabled:pointer-events-none disabled:text-muted disabled:opacity-50"
        >
          <SendHorizontal size={16} />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span id="discord-composer-hint">Entrée pour envoyer · Maj + Entrée pour aller à la ligne</span>
        {length > COUNTER_FROM && (
          <span className={cn("tabular-nums", tooLong && "font-semibold text-danger")} aria-live="polite">
            {length} / {MESSAGE_MAX_LENGTH}
          </span>
        )}
      </div>
    </form>
  );
});
