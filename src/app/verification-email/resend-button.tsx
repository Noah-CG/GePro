"use client";

import { useState, useTransition } from "react";
import { resendVerification } from "@/actions/auth";
import { FormError, FormNotice } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

/** Renvoie le lien de vérification (le précédent est annulé). */
export function ResendVerificationButton({ suite }: { suite: string }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const resend = () =>
    startTransition(async () => {
      const res = await resendVerification(suite);
      setResult(res.ok ? { ok: true, message: "Nouveau lien envoyé. Le précédent ne fonctionne plus." } : { ok: false, message: res.error });
    });

  return (
    <div className="space-y-2">
      {result && (result.ok ? <FormNotice>{result.message}</FormNotice> : <FormError>{result.message}</FormError>)}
      <Button variant="secondary" className="w-full justify-center" onClick={resend} loading={pending}>
        Renvoyer l&apos;email
      </Button>
    </div>
  );
}
