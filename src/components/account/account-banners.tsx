"use client";

import { AtSign, MailWarning } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resendVerification, setUsername } from "@/actions/auth";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { UsernameDialog } from "./username-dialog";

/**
 * Bandeaux du compte, en haut des pages :
 * - adresse email à vérifier (pour pouvoir accepter les invitations par email ou par lien), si
 *   l'envoi d'emails est configuré ;
 * - nom d'utilisateur proposé par la migration, à garder ou à modifier (première connexion) ; ou à
 *   choisir s'il n'y en a pas (compte créé par l'ancienne version pendant le déploiement).
 */
export function AccountBanners({
  emailEnabled,
  invitationsAwaitingVerification,
}: {
  emailEnabled: boolean;
  invitationsAwaitingVerification: number;
}) {
  const { me } = useApp();
  return (
    <>
      {emailEnabled && !me.emailVerifiedAt && <VerifyEmailBanner email={me.email} waiting={invitationsAwaitingVerification} />}
      {!me.usernameConfirmedAt && <ConfirmUsernameBanner username={me.username} />}
    </>
  );
}

const banner = "mb-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm";

function VerifyEmailBanner({ email, waiting }: { email: string; waiting: number }) {
  const { toast } = useApp();
  const [pending, startTransition] = useTransition();

  const resend = () =>
    startTransition(async () => {
      const res = await resendVerification();
      toast(res.ok ? `Lien de vérification envoyé à ${email}` : res.error, res.ok ? "success" : "error");
    });

  return (
    <div className={`${banner} border-warning/40 bg-warning-soft`} role="status">
      <MailWarning size={18} className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        Vérifiez votre adresse <strong>{email}</strong> pour pouvoir rejoindre des projets.
        {waiting > 0 && ` ${waiting} invitation${waiting > 1 ? "s" : ""} vous attend${waiting > 1 ? "ent" : ""}.`}
      </p>
      <Button size="sm" variant="secondary" onClick={resend} loading={pending}>
        Renvoyer le lien
      </Button>
    </div>
  );
}

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
