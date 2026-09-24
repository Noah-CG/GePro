import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isLocalDb } from "@/db";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-accent-fg">
            G
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Connexion à GePro</h1>
          <p className="mt-1 text-sm text-muted">Votre compte est créé par un administrateur.</p>
        </div>
        <LoginForm />
        {isLocalDb && (
          <p className="mt-6 rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted">
            Base locale de démo : <strong>camille@exemple.fr</strong> / <strong>demo1234</strong>
          </p>
        )}
      </div>
    </main>
  );
}
