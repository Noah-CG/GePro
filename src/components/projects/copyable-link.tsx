"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Lien à transmettre, affiché une seule fois, avec un bouton Copier. */
export function CopyableLink({ link, label, note }: { link: string; label: string; note: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
      <p className="mb-2 text-muted">{note}</p>
      <div className="flex gap-2">
        <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" aria-label={label} />
        <Button type="button" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copié" : "Copier"}
        </Button>
      </div>
    </div>
  );
}
