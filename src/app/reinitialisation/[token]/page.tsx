import type { Metadata } from "next";
import Link from "next/link";
import { isResetTokenValid } from "@/actions/auth";
import { AuthCard, AuthShell, FormError } from "@/components/auth/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nouveau mot de passe", referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };

/** Lien reçu par email (valable 1 h, une seule fois). Changer le mot de passe ferme toutes les sessions. */
export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);

  return (
    <AuthShell
      title="Nouveau mot de passe"
      subtitle={valid ? "Vous serez déconnecté·e de tous vos appareils." : undefined}
      footer={
        <Link href="/connexion" className="font-medium text-accent hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <AuthCard>
          <FormError>Ce lien de réinitialisation est invalide, a expiré ou a déjà servi.</FormError>
          <Link href="/mot-de-passe-oublie" className="block text-center text-sm font-medium text-accent hover:underline">
            Demander un nouveau lien
          </Link>
        </AuthCard>
      )}
    </AuthShell>
  );
}
