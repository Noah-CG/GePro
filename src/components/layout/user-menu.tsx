"use client";

import * as Popover from "@radix-ui/react-popover";
import { KeyRound, LogOut, Monitor, Moon, Sun, Users } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { changePassword, logout } from "@/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";

/**
 * Menu du compte : thème, mot de passe, membres (admin), déconnexion.
 * `side` : côté d'ouverture du menu (à droite quand la barre latérale est réduite).
 */
export function UserMenu({ compact, side = "bottom" }: { compact?: boolean; side?: "bottom" | "right" }) {
  const { me } = useApp();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const themes = [
    { value: "light", label: "Clair", icon: Sun },
    { value: "dark", label: "Sombre", icon: Moon },
    { value: "system", label: "Auto", icon: Monitor },
  ];
  const row = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2";

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          className={cn("flex items-center gap-2.5 rounded-lg text-left hover:bg-surface-2", compact ? "p-1" : "w-full px-2 py-1.5")}
          aria-label="Menu du compte"
        >
          <Avatar user={me} size={compact ? 28 : 26} />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.name}</span>
              <span className="block truncate text-xs text-muted">{me.email}</span>
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side={side} sideOffset={8} align={compact ? "end" : "start"} className="z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
            <div className="mb-1 flex rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Thème">
              {themes.map((t) => (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs",
                    theme === t.value ? "bg-surface font-medium shadow-sm" : "text-muted",
                  )}
                >
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>
            {me.role === "admin" && (
              <Link href="/membres" onClick={() => setOpen(false)} className={row}>
                <Users size={15} className="text-muted" /> Gérer les membres
              </Link>
            )}
            <button
              className={row}
              onClick={() => {
                setOpen(false);
                setPwdOpen(true);
              }}
            >
              <KeyRound size={15} className="text-muted" /> Changer de mot de passe
            </button>
            <form action={logout}>
              <button type="submit" className={cn(row, "text-danger")}>
                <LogOut size={15} /> Se déconnecter
              </button>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <PasswordDialog key={String(pwdOpen)} open={pwdOpen} onOpenChange={setPwdOpen} />
    </>
  );
}

function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await changePassword(current, next);
      if (!res.ok) return setError(res.error);
      toast("Mot de passe modifié");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Changer de mot de passe">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Mot de passe actuel" htmlFor="pwd-current">
          <Input id="pwd-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nouveau mot de passe" htmlFor="pwd-next" hint="8 caractères minimum">
          <Input id="pwd-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!current || !next} loading={pending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
