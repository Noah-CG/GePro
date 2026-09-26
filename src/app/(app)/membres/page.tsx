import type { Metadata } from "next";
import { MembersManager } from "@/components/members/members-manager";
import { PageHeader } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/auth";
import { getAccounts } from "@/lib/queries";

export const metadata: Metadata = { title: "Membres" };

/**
 * Gestion des comptes (réservée aux administrateurs de l'application). Créer un compte ne donne
 * accès à aucun projet : il faut ensuite y être invité.
 */
export default async function MembersPage() {
  await requireAdmin();
  const team = await getAccounts();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Membres de l'équipe" subtitle="Créez les comptes et communiquez les identifiants à chaque membre. Un nouveau compte ne voit aucun projet tant qu'il n'y est pas invité." />
      <MembersManager team={team} />
    </div>
  );
}
