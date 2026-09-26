"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
type Person = { id: string; name: string; color: string };

/** Choix du membre du projet dont on consulte le temps de travail (propriétaire et administrateurs du projet). */
export function MemberPicker({ team, value, meId }: { team: Person[]; value: string; meId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = team.map((m) => ({ value: m.id, label: m.id === meId ? `${m.name} (moi)` : m.name, dot: m.color }));

  return (
    <div className="flex items-center gap-2" aria-busy={pending || undefined}>
      {pending && <Spinner size={14} className="text-muted" />}
      <SimpleSelect
        aria-label="Membre affiché"
        value={value}
        onValueChange={(id) => startTransition(() => router.push(id === meId ? "/temps" : `/temps?membre=${id}`))}
        options={options}
        className="w-56"
      />
    </div>
  );
}
