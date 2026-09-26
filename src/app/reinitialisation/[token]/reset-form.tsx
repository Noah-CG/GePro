"use client";

import { useActionState } from "react";
import { resetPassword, type ResetState } from "@/actions/auth";
import { AuthCard, FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PASSWORD_MIN } from "@/lib/validation";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPassword, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate>
      <AuthCard>
        <input type="hidden" name="token" value={token} />
        <Field label="Nouveau mot de passe" htmlFor="password" error={errors.password} hint={`${PASSWORD_MIN} caractères minimum.`}>
          <Input id="password" name="password" type="password" autoComplete="new-password" autoFocus required />
        </Field>
        <Field label="Confirmation" htmlFor="confirm" error={errors.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        {state.error && <FormError>{state.error}</FormError>}
        <Button type="submit" variant="primary" className="w-full justify-center" loading={pending}>
          Changer le mot de passe
        </Button>
      </AuthCard>
    </form>
  );
}
