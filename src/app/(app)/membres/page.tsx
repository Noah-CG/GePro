import type { Metadata } from "next";
import { MembersManager } from "@/components/members/members-manager";
import { PageHeader } from "@/components/ui/misc";
import { requireAdmin } from "@/lib/auth";
import { getTeam } from "@/lib/queries";

export const metadata: Metadata = { title: "Membres" };

/** Gestion des comptes (réservée aux administrateurs). */
export default async function MembersPage() {
  await requireAdmin();
  const team = await getTeam();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Membres de l'équipe" subtitle="Créez les comptes et communiquez les identifiants à chaque membre." />
      <MembersManager team={team} />
    </div>
  );
}
