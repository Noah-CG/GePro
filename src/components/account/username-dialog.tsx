"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { setUsername } from "@/actions/auth";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useUsernameCheck } from "./use-username-check";

/** Choix (ou confirmation) du nom d'utilisateur du compte connecté. */
export function UsernameDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { me, toast } = useApp();
  const router = useRouter();
  const [value, setValue] = useState(me.username ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const check = useUsernameCheck(value, me.username);

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await setUsername(value);
      if (!res.ok) return setError(res.error);
      toast(`Votre nom d'utilisateur est @${res.data.username}`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nom d'utilisateur"
      description="Il sert à vous connecter et à être invité·e dans un projet. Il est visible des membres de vos projets."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Nom d'utilisateur"
          htmlFor="username-edit"
          error={check.error ?? error}
          hint={
            check.available ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check size={12} /> Disponible
              </span>
            ) : check.checking ? (
              "Vérification…"
            ) : (
              "3 à 30 caractères : lettres, chiffres, _ et -."
            )
          }
        >
          <Input
            id="username-edit"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!check.available} loading={pending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
