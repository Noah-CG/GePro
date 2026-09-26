import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { afterLoginPath } from "@/lib/invitations";
import { ConfirmEmail } from "./confirm-email";

export const metadata: Metadata = { title: "Confirmer votre adresse email", referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ suite?: string }> };

/**
 * Lien reçu par email. La confirmation se fait par un bouton (POST) et non à l'ouverture : les
 * antivirus de messagerie qui ouvrent les liens ne consomment pas le jeton.
 */
export default async function ConfirmEmailPage({ params, searchParams }: Props) {
  const [{ token }, { suite }] = await Promise.all([params, searchParams]);
  return (
    <AuthShell title="Confirmer votre adresse email">
      <ConfirmEmail token={token} next={afterLoginPath(suite)} />
    </AuthShell>
  );
}
