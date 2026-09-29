import type { NextRequest } from "next/server";
import { atLeast, getProjectRole } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime, formatLong, todayISO } from "@/lib/dates";
import { contentDisposition, PDF_MIME } from "@/lib/files";
import { buildJournalPdf } from "@/lib/journal-pdf";
import { getJournalEntries, getProjectMembers, getProjectOptions } from "@/lib/queries";
import { isUuid, journalExportInput } from "@/lib/validation";

type Props = { params: Promise<{ id: string }> };

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * Export PDF du journal de bord d'un projet (bouton Exporter du tableau de bord).
 * `?membre=<id>|tous&du=YYYY-MM-DD&au=YYYY-MM-DD`, tous facultatifs (voir journalExportInput).
 *
 * Mêmes droits que la page Temps : chacun exporte ses propres entrées ; celles d'un autre membre
 * ou de toute l'équipe sont réservées au propriétaire et aux administrateurs du projet.
 * Non-membre : 404, comme un projet inexistant.
 */
export async function GET(request: NextRequest, { params }: Props) {
  const me = await getCurrentUser();
  if (!me) return text("Connexion requise.", 401);

  const { id } = await params;
  const role = isUuid(id) ? await getProjectRole(me.id, id) : null;
  if (!role) return text("Projet introuvable.", 404);

  const parsed = journalExportInput.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return text(parsed.error.issues[0].message, 400);
  const { membre = me.id, du, au } = parsed.data;

  const everyone = membre === "tous";
  if (membre !== me.id && !atLeast(role, "admin")) {
    return text("Seuls le propriétaire et les administrateurs du projet peuvent exporter les entrées des autres membres.", 403);
  }
  const [projects, team] = await Promise.all([getProjectOptions(me.id), getProjectMembers(id)]);
  const project = projects.find((p) => p.id === id);
  const member = everyone ? null : team.find((m) => m.id === membre);
  if (!project || (!everyone && !member)) return text("Membre introuvable.", 404);

  const entries = await getJournalEntries(id, { userId: member?.id, from: du, to: au });
  const periodLabel =
    du && au ? `Du ${formatLong(du)} au ${formatLong(au)}` : du ? `Depuis le ${formatLong(du)}` : au ? `Jusqu'au ${formatLong(au)}` : "Depuis le début";
  const pdf = await buildJournalPdf({
    projectName: project.name,
    scopeLabel: member ? member.name : "Toute l'équipe",
    periodLabel,
    exportedAt: formatDateTime(new Date().toISOString()),
    entries,
  });

  const who = member ? member.name : "equipe";
  const fileName = `Journal ${project.name} - ${who}${du || au ? ` - ${du ?? "debut"} au ${au ?? todayISO()}` : ""}.pdf`;
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": PDF_MIME,
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": contentDisposition("attachment", fileName.replace(/[\\/:*?"<>|]/g, "-")),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
