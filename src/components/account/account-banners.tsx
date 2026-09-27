"use client";

import { AtSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setUsername } from "@/actions/auth";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { UsernameDialog } from "./username-dialog";

/**
 * Bandeau du compte, en haut des pages :
 * - nom d'utilisateur proposé par la migration, à garder ou à modifier (première connexion) ; ou à
 *   choisir s'il n'y en a pas (compte créé par l'ancienne version pendant le déploiement).
 */
export function AccountBanners() {
  const { me } = useApp();
  return !me.usernameConfirmedAt ? <ConfirmUsernameBanner username={me.username} /> : null;
}

const banner = "mb-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm";

function ConfirmUsernameBanner({ username }: { username: string | null }) {
  const { toast } = useApp();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const keep = (current: string) =>
    startTransition(async () => {
      const res = await setUsername(current);
      if (!res.ok) return toast(res.error, "error");
      router.refresh();
    });

  return (
    <div className={`${banner} border-accent/30 bg-accent-soft`} role="status">
      <AtSign size={18} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1">
        {username ? (
          <>
            Nouveau : vous avez un nom d&apos;utilisateur, <strong>@{username}</strong>. Il sert à vous connecter et à être invité·e.
          </>
        ) : (
          "Nouveau : choisissez un nom d'utilisateur. Il sert à vous connecter et à être invité·e."
        )}
      </p>
      <div className="flex gap-2">
        {username && (
          <Button size="sm" variant="primary" onClick={() => keep(username)} loading={pending}>
            Le garder
          </Button>
        )}
        <Button size="sm" variant={username ? "secondary" : "primary"} onClick={() => setEditing(true)} disabled={pending}>
          {username ? "Modifier" : "Choisir"}
        </Button>
      </div>
      <UsernameDialog key={String(editing)} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
