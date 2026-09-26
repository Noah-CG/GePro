"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { verifyEmail } from "@/actions/auth";
import { AuthCard, FormError, FormNotice } from "@/components/auth/auth-shell";
import { Button, buttonClass } from "@/components/ui/button";

export function ConfirmEmail({ token, next }: { token: string; next: string }) {
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const res = await verifyEmail(token);
      setResult(res.ok ? { ok: true } : { ok: false, error: res.error });
    });

  if (result?.ok) {
    return (
      <AuthCard>
        <FormNotice>Adresse email vérifiée. Vous pouvez maintenant accepter des invitations à des projets.</FormNotice>
        <Link href={next} className={buttonClass({ variant: "primary", className: "w-full justify-center" })}>
          {next === "/" ? "Continuer vers GePro" : "Continuer vers l'invitation"}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      {result && !result.ok && (
        <>
          <FormError>{result.error}</FormError>
          <p className="text-sm text-muted">Connectez-vous, puis demandez un nouveau lien depuis la bannière en haut de GePro.</p>
        </>
      )}
      {!result && <p className="text-sm text-muted">Cliquez pour confirmer que cette adresse email est bien la vôtre.</p>}
      {!result ? (
        <Button variant="primary" className="w-full justify-center" onClick={confirm} loading={pending}>
          Confirmer mon adresse
        </Button>
      ) : (
        <Link href="/connexion" className={buttonClass({ variant: "secondary", className: "w-full justify-center" })}>
          Aller à la connexion
        </Link>
      )}
    </AuthCard>
  );
}
