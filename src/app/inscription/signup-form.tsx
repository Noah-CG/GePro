"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { signup, type SignupState } from "@/actions/auth";
import { useUsernameCheck } from "@/components/account/use-username-check";
import { AuthCard, FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PASSWORD_MIN } from "@/lib/validation";

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, {});
  const [username, setUsername] = useState(state.values?.username ?? "");
  const check = useUsernameCheck(username);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate>
      <AuthCard>
        <input type="hidden" name="suite" value={next} />
        <Field
          label="Nom d'utilisateur"
          htmlFor="username"
          error={check.error ?? errors.username}
          hint={
            check.available ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check size={12} /> Disponible
              </span>
            ) : check.checking ? (
              "Vérification…"
            ) : (
              "3 à 30 caractères : lettres, chiffres, _ et -. Sert à vous inviter et à vous connecter."
            )
          }
        >
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={Boolean(check.error ?? errors.username)}
          />
        </Field>
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
