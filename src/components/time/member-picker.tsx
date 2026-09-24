"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import type { Member } from "@/lib/queries";

/** Choix du membre dont on consulte le temps de travail (administrateurs). */
export function MemberPicker({ team, value, meId }: { team: Member[]; value: string; meId: string }) {
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
