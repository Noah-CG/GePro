import { Link2Off, MailWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinProjectButton } from "@/components/projects/join-project-button";
import { Card, EmptyState } from "@/components/ui/misc";
import { getProjectRole } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { hashInvitationToken } from "@/lib/invitations";
import { getInviteLinkByTokenHash } from "@/lib/queries";

export const metadata: Metadata = { title: "Rejoindre un projet", referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };

/**
 * Lien d'invitation ouvert. Sans compte, on arrive ici après l'inscription (le lien est repris) ;
 * connecté, on rejoint le projet après confirmation, comme simple membre. L'adresse email doit
 * être vérifiée. Un lien invalide, expiré, révoqué ou épuisé ne révèle rien du projet.
 */
export default async function JoinPage({ params }: Props) {
  const me = await requireUser();
  const { token } = await params;
  const link = /^[A-Za-z0-9_-]{1,100}$/.test(token) ? await getInviteLinkByTokenHash(hashInvitationToken(token)) : null;

  // Déjà membre : le lien mène simplement au projet.
  if (link && (await getProjectRole(me.id, link.projectId))) redirect(`/projets/${link.projectId}`);

  if (!link || !link.usable) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <EmptyState icon={<Link2Off size={28} />} title="Lien d'invitation invalide">
          Ce lien est invalide, a expiré, a été révoqué ou a déjà servi autant de fois que prévu. Demandez-en un nouveau à un
          administrateur du projet.{" "}
          <Link href="/projets" className="font-medium text-accent hover:underline">
            Retour aux projets
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (!me.emailVerifiedAt) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <EmptyState icon={<MailWarning size={28} />} title="Vérifiez d'abord votre adresse email">
          Pour rejoindre un projet, confirmez l&apos;adresse {me.email} avec le lien reçu par email (ou renvoyez-le depuis le bandeau
          ci-dessus), puis rouvrez ce lien d&apos;invitation.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card className="p-6">
        <p className="text-sm text-muted">{link.createdByName ? `${link.createdByName} vous invite` : "Vous êtes invité·e"} à rejoindre</p>
        <h1 className="mt-1 flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: link.projectColor }} />
          {link.projectName}
        </h1>
        <p className="mt-2 text-sm text-muted">En tant que membre. Vous pourrez quitter le projet à tout moment.</p>
        <div className="mt-5">
          <JoinProjectButton token={token} projectName={link.projectName} />
        </div>
      </Card>
    </div>
  );
}
