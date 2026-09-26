import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { membersSettingsHref } from "@/lib/members";
import { getSelectedProjectId } from "@/lib/selected-project";

/**
 * Ancienne page de gestion des membres : elle se trouve désormais dans les paramètres du projet
 * (section « Membres de l'équipe »). Sans projet, on renvoie vers la liste des projets.
 */
export default async function MembersPage() {
  await requireAdmin();
  redirect(membersSettingsHref(await getSelectedProjectId()));
}
