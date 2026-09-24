"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveWorkNote } from "@/actions/work-sessions";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";

/** Période dont on rédige le journal ; `label` la situe ("24 sept. 2026 à 14:32 · 1 h 20"). */
export type NoteTarget = { id: string; label: string; note: string };

/**
 * Journal de bord d'une période de travail : ce qui a été fait pendant le temps chronométré.
 * À monter avec `key={target?.id}` pour repartir du texte enregistré à chaque ouverture.
 */
export function WorkNoteDialog({ target, onClose }: { target: NoteTarget | null; onClose: (saved: boolean) => void }) {
  const { toast } = useApp();
  const [note, setNote] = useState(target?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    startTransition(async () => {
      const res = await saveWorkNote(target.id, note);
      if (!res.ok) return setError(res.error);
      toast("Journal enregistré");
      onClose(true);
    });
  }

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => !o && onClose(false)}
      title={target?.note ? "Modifier le journal" : "Qu'avez-vous fait ?"}
      description={target?.label}
    >
      <form onSubmit={submit} className="space-y-4">
        <Textarea
          autoFocus
          aria-label="Journal de bord"
          className="min-h-40"
          placeholder={"Ex. :\n- Maquettes de la page d'accueil\n- Relecture des retours client\n- Prochaine étape : valider les couleurs"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Entrée enregistre sans quitter le clavier.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Ctrl + Entrée pour enregistrer</span>
          <div className="flex gap-2">
            <Button onClick={() => onClose(false)}>Plus tard</Button>
            <Button type="submit" variant="primary" disabled={pending}>
              Enregistrer
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
