import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, AuthShell, FormError, FormNotice } from "@/components/auth/auth-shell";
import { buttonClass } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { emailErrorMessage, isEmailEnabled, type EmailErrorCode } from "@/lib/email/send";
import { afterLoginPath } from "@/lib/invitations";
import { ResendVerificationButton } from "./resend-button";

export const metadata: Metadata = { title: "Vérifiez votre email" };

type Props = { searchParams: Promise<{ suite?: string; envoi?: string }> };

const SEND_ERRORS: EmailErrorCode[] = ["not_configured", "quota", "rejected", "unavailable"];

/** Après l'inscription : l'email de vérification est parti (ou pas, et on le dit). */
export default async function VerifyEmailPendingPage({ searchParams }: Props) {
  const me = await getCurrentUser();
  const { suite, envoi } = await searchParams;
  const next = afterLoginPath(suite);
  if (!me) redirect("/connexion");
  // Sans envoi d'emails, pas de vérification : rien à faire ici.
  if (!isEmailEnabled()) redirect(next);
  const sendError = SEND_ERRORS.find((code) => code === envoi);

  return (
    <AuthShell title={me.emailVerifiedAt ? "Adresse vérifiée" : "Vérifiez votre adresse email"}>
      <AuthCard>
        {me.emailVerifiedAt ? (
          <FormNotice>Votre adresse {me.email} est vérifiée.</FormNotice>
        ) : (
          <>
            {sendError ? (
              <FormError>Votre compte est créé, mais l&apos;email de vérification n&apos;est pas parti : {emailErrorMessage(sendError)}</FormError>
            ) : (
              <FormNotice>
                Un lien de confirmation a été envoyé à <strong>{me.email}</strong>. Il est valable 24 heures.
              </FormNotice>
            )}
            <p className="text-sm text-muted">
              Vous pouvez déjà utiliser GePro. Pour rejoindre un projet, votre adresse doit être vérifiée.
            </p>
            <ResendVerificationButton suite={next} />
          </>
        )}
        <Link href={next} className={buttonClass({ variant: "primary", className: "w-full justify-center" })}>
          {next === "/" ? "Continuer vers GePro" : "Continuer vers l'invitation"}
        </Link>
      </AuthCard>
    </AuthShell>
  );
}
