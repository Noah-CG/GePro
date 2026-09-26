"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "@/actions/auth";
import { AuthCard, FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/** `next` : page où revenir après la connexion (lien d'invitation, par exemple). */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action}>
      <AuthCard>
        <input type="hidden" name="suite" value={next} />
        <Field label="Email ou nom d'utilisateur" htmlFor="identifier">
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            defaultValue={state.identifier}
          />
        </Field>
        <Field
          label="Mot de passe"
          htmlFor="password"
          hint={
            <Link href="/mot-de-passe-oublie" className="hover:text-text hover:underline">
              Mot de passe oublié ?
            </Link>
          }
        >
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state.error && <FormError>{state.error}</FormError>}
        <Button type="submit" variant="primary" className="w-full justify-center" loading={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </Button>
      </AuthCard>
    </form>
  );
}
