import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, FormNotice } from "@/components/auth/auth-shell";
import { isLocalDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { afterLoginPath, suiteQuery } from "@/lib/invitations";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

type Props = { searchParams: Promise<{ suite?: string; reinitialise?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = afterLoginPath(params.suite);
  if (await getCurrentUser()) redirect(next);
  const query = suiteQuery(params.suite);

  return (
    <AuthShell
      title="Connexion à GePro"
      footer={
        <p>
          Pas encore de compte ?{" "}
          <Link href={`/inscription${query}`} className="font-medium text-accent hover:underline">
            Créer un compte
          </Link>
        </p>
      }
    >
      {params.reinitialise === "1" && (
        <div className="mb-4">
          <FormNotice>Mot de passe modifié. Connectez-vous avec le nouveau.</FormNotice>
        </div>
      )}
      <LoginForm next={next} />
      {isLocalDb && (
        <p className="mt-6 rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted">
          Base locale de démo : <strong>camille@exemple.fr</strong> / <strong>demo1234</strong>
        </p>
      )}
    </AuthShell>
  );
}
