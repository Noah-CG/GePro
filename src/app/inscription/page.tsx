import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCurrentUser } from "@/lib/auth";
import { afterLoginPath, suiteQuery } from "@/lib/invitations";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Créer un compte" };

type Props = { searchParams: Promise<{ suite?: string }> };

/**
 * Inscription libre. Le compte est utilisable tout de suite, mais ne donne accès à aucun projet :
 * on n'y entre que sur invitation (et l'email doit être vérifié pour en accepter une).
 */
export default async function SignupPage({ searchParams }: Props) {
  const { suite } = await searchParams;
  const next = afterLoginPath(suite);
  if (await getCurrentUser()) redirect(next);

  return (
    <AuthShell
      title="Créer un compte GePro"
      subtitle={next.startsWith("/rejoindre/") ? "Créez votre compte pour rejoindre le projet." : undefined}
      footer={
        <p>
          Déjà un compte ?{" "}
          <Link href={`/connexion${suiteQuery(suite)}`} className="font-medium text-accent hover:underline">
            Se connecter
          </Link>
        </p>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
