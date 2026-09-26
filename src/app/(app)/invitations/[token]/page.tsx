import { MailX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InvitationActions } from "@/components/projects/received-invitations";
import { Card, EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { hashInvitationToken } from "@/lib/invitations";
import { getInvitationByTokenHash } from "@/lib/queries";

export const metadata: Metadata = { title: "Invitation" };

type Props = { params: Promise<{ token: string }> };

const ROLE_LABELS = { owner: "propriétaire", admin: "administrateur", member: "membre" } as const;

/**
 * Lien d'invitation à un projet. Seul le compte dont l'email est celui de l'invitation voit le
 * projet et peut accepter : pour tout autre compte (ou un lien invalide), rien n'est révélé.
 */
export default async function InvitationPage({ params }: Props) {
  const me = await requireUser();
  const { token } = await params;
  const invitation = await getInvitationByTokenHash(hashInvitationToken(token));

  if (!invitation || invitation.email !== me.email.toLowerCase()) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <EmptyState icon={<MailX size={28} />} title="Invitation introuvable">
          Ce lien est invalide, a expiré, a déjà été utilisé, ou n&apos;est pas destiné au compte {me.email}. Demandez une nouvelle
          invitation à un administrateur du projet.{" "}
          <Link href="/projets" className="font-medium text-accent hover:underline">
            Retour aux projets
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card className="p-6">
        <p className="text-sm text-muted">{invitation.invitedByName ? `${invitation.invitedByName} vous invite` : "Vous êtes invité·e"} à rejoindre</p>
        <h1 className="mt-1 flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: invitation.projectColor }} />
          {invitation.projectName}
        </h1>
        <p className="mt-2 text-sm text-muted">
          En tant que {ROLE_LABELS[invitation.role]} · invitation valable jusqu&apos;au {formatDateTime(invitation.expiresAt)}.
        </p>
        <div className="mt-5">
          <InvitationActions reference={{ token }} projectName={invitation.projectName} />
        </div>
      </Card>
    </div>
  );
}
