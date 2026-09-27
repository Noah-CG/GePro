import type { Metadata } from "next";
import { MembersManager } from "@/components/members/members-manager";
import { PageHeader } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/auth";
import { getAccounts } from "@/lib/queries";

export const metadata: Metadata = { title: "Comptes" };

/**
 * Administration des comptes de l'application (administrateurs de GePro seulement) : création,
 * réinitialisation du mot de passe, suppression. Sans rapport avec les membres d'un projet, qui se
 * gèrent dans ses paramètres.
 */
export default async function AccountsPage() {
  await requireAdmin();
  const accounts = await getAccounts();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Comptes"
        subtitle="Chacun peut aussi créer son compte depuis la page d'inscription. Un compte ne voit aucun projet tant qu'il n'y est pas invité."
      />
      <MembersManager team={accounts} />
    </div>
  );
}
