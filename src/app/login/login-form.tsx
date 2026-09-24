"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required defaultValue={state.email} />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" className="w-full justify-center" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
