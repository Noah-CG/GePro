import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import { ReceivedInvitations } from "@/components/projects/received-invitations";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { formatLong, todayISO } from "@/lib/dates";
import { getReceivedInvitations } from "@/lib/queries";
import { getSelectedProjectId, redirectToSelectedProject } from "@/lib/selected-project";

export const metadata: Metadata = { title: "Tableau de bord" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Accueil : le tableau de bord du projet sélectionné (/projets/<id>/tableau-de-bord). Sans aucun
 * projet (nouveau compte, pas encore invité), une page d'accueil avec les invitations reçues.
 */
export default async function HomePage({ searchParams }: Props) {
  const me = await requireUser();
  if (await getSelectedProjectId(me.id)) return redirectToSelectedProject(me.id, "tableau-de-bord", await searchParams);

  const invitations = await getReceivedInvitations(me);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Bonjour ${me.name.split(" ")[0]} 👋`} subtitle={formatLong(todayISO())} />
      <ReceivedInvitations invitations={invitations} />
      <EmptyState icon={<FolderKanban size={28} />} title="Aucun projet pour l'instant">
        Créez votre premier projet avec le bouton en haut de la barre latérale ou la touche P, ou acceptez une invitation.
      </EmptyState>
    </div>
  );
}
