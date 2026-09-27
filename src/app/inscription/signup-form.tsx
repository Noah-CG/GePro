"use client";

import { useActionState } from "react";
import { signup, type SignupState } from "@/actions/auth";
import { AuthCard, FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { NAME_PART_MAX, PASSWORD_MIN } from "@/lib/validation";

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate>
      <AuthCard>
        <input type="hidden" name="suite" value={next} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" htmlFor="firstName" error={errors.firstName}>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              maxLength={NAME_PART_MAX}
              autoFocus
              required
              defaultValue={state.values?.firstName}
              aria-invalid={Boolean(errors.firstName)}
            />
          </Field>
          <Field label="Nom" htmlFor="lastName" error={errors.lastName}>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              maxLength={NAME_PART_MAX}
              required
              defaultValue={state.values?.lastName}
              aria-invalid={Boolean(errors.lastName)}
            />
          </Field>
        </div>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} aria-invalid={Boolean(errors.email)} />
        </Field>
        <Field label="Mot de passe" htmlFor="password" error={errors.password} hint={`${PASSWORD_MIN} caractères minimum.`}>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required aria-invalid={Boolean(errors.password)} />
        </Field>
        <Field label="Confirmation du mot de passe" htmlFor="confirm" error={errors.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={Boolean(errors.confirm)} />
        </Field>
        {state.error && <FormError>{state.error}</FormError>}
        <Button type="submit" variant="primary" className="w-full justify-center" loading={pending}>
          {pending ? "Création du compte…" : "Créer mon compte"}
        </Button>
      </AuthCard>
    </form>
  );
}
