"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotState } from "@/actions/auth";
import { AuthCard, FormError, FormNotice } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestPasswordReset, {});

  if (state.done) {
    return (
      <AuthCard>
        {/* Même message que le compte existe ou non. */}
        <FormNotice>
          Si un compte GePro utilise l&apos;adresse <strong>{state.email}</strong>, un lien de réinitialisation vient d&apos;y être envoyé. Il
          est valable 1 heure. Pensez à regarder dans les indésirables.
        </FormNotice>
      </AuthCard>
    );
  }

  return (
    <form action={action}>
      <AuthCard>
        <Field label="Email du compte" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" autoFocus required defaultValue={state.email} />
        </Field>
        {state.error && <FormError>{state.error}</FormError>}
        <Button type="submit" variant="primary" className="w-full justify-center" loading={pending}>
          Envoyer le lien
        </Button>
      </AuthCard>
    </form>
  );
}
