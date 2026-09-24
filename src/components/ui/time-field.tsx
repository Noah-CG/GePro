"use client";

import { Clock } from "lucide-react";
import { useState } from "react";
import { parseClockTime } from "@/lib/work-time";
import { cn } from "@/lib/utils";

/**
 * Champ d'heure "HH:MM", sans le contrôle natif du navigateur : on tape librement ("9h30",
 * "930", "18:15"…) et l'heure est remise au format en quittant le champ.
 */
export function TimeField({
  id,
  value,
  onChange,
  invalid,
  "aria-describedby": describedBy,
}: {
  id?: string;
  /** "HH:MM" (ou la saisie en cours, telle quelle, si elle n'est pas encore valide). */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  "aria-describedby"?: string;
}) {
  const [focused, setFocused] = useState(false);
  const wrong = invalid || (!focused && value !== "" && parseClockTime(value) === null);

  return (
    <div className="relative">
      <Clock size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="09:30"
        value={value}
        aria-invalid={wrong || undefined}
        aria-describedby={describedBy}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setFocused(false);
          const parsed = parseClockTime(value);
          if (parsed) onChange(parsed);
        }}
        className={cn(
          "h-9 w-full rounded-lg border bg-surface pr-3 pl-9 text-sm tabular-nums placeholder:text-muted focus:ring-2 focus:ring-ring/40 focus:outline-none",
          wrong ? "border-danger focus:border-danger" : "border-border focus:border-accent",
        )}
      />
    </div>
  );
}
