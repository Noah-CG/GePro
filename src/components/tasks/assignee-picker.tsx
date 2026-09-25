"use client";

import * as Popover from "@radix-ui/react-popover";
import { Plus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useApp } from "@/components/layout/app-provider";

/** Sélection multiple des responsables : pastilles retirables + liste des membres pas encore assignés. */
export function AssigneePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { team, membersById, me } = useApp();
  const add = (id: string) => onChange([...value, id]);
  const remove = (id: string) => onChange(value.filter((v) => v !== id));
  const available = team.filter((m) => !value.includes(m.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((id) => {
        const m = membersById.get(id);
        if (!m) return null;
        return (
          <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-0.5 text-xs">
            <Avatar user={m} size={20} />
            {m.name}
            <button type="button" onClick={() => remove(id)} className="rounded-full p-0.5 text-muted hover:text-text" aria-label={`Retirer ${m.name}`}>
              <X size={12} />
            </button>
          </span>
        );
      })}

      <Popover.Root>
        <Popover.Trigger className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted hover:border-accent hover:text-accent">
          <Plus size={12} /> {value.length ? "Ajouter" : "Assigner"}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-[70] max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl"
          >
            {!value.includes(me.id) && (
              <button
                type="button"
                onClick={() => add(me.id)}
                className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-accent-soft"
              >
                M'assigner
              </button>
            )}
            {available.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted">Tout le monde est déjà assigné.</p>}
            {available.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => add(m.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              >
                <Avatar user={m} size={22} />
                <span className="flex-1 truncate">{m.name}</span>
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
