import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { membersSettingsHref } from "@/lib/members";
import { getSelectedProjectId } from "@/lib/selected-project";

/**
 * Ancienne page de gestion des comptes : elle se trouve désormais dans les paramètres du projet
 * (section « Comptes de l'équipe »). Sans projet, on renvoie vers la liste des projets.
 */
export default async function MembersPage() {
  const me = await requireAdmin();
  redirect(membersSettingsHref(await getSelectedProjectId(me.id)));
}
