import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AuthCard, AuthShell, FormNotice } from "@/components/auth/auth-shell";
import { isEmailEnabled, RESET_BY_ADMIN } from "@/lib/email";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

/** Sans envoi d'emails configuré, seul un administrateur peut réinitialiser un mot de passe. */
export default async function ForgotPasswordPage() {
  // Rendue à chaque requête : la configuration des emails est lue au démarrage (Docker), pas au build.
  await connection();
  const emailEnabled = isEmailEnabled();
  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle={emailEnabled ? "Recevez par email un lien pour en choisir un nouveau." : undefined}
      footer={
        <Link href="/connexion" className="font-medium text-accent hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      {emailEnabled ? (
        <ForgotForm />
      ) : (
        <AuthCard>
          <FormNotice>{RESET_BY_ADMIN}</FormNotice>
        </AuthCard>
      )}
    </AuthShell>
  );
}
