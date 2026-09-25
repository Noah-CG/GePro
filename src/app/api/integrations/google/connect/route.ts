import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildAuthUrl, CALENDAR_SCOPE, GOOGLE_SCOPE, IDENTITY_SCOPES, isGoogleConfigured } from "@/lib/integrations/google";
import { startOAuthFlow } from "@/lib/integrations/oauth";
import { isUuid } from "@/lib/validation";

/**
 * Démarre la connexion d'un compte Google : redirection vers l'écran de consentement.
 * - `?projectId=<id>` : depuis les paramètres d'un projet (Google Docs, lecture de Drive).
 * - `?agenda=1` : depuis le calendrier, pour la synchronisation vers Google Agenda (agendas
 *   créés par GePro uniquement, plus l'identité du compte).
 * Une seule connexion Google par membre : grâce à l'autorisation incrémentale, les droits déjà
 * accordés (Drive ou agenda) sont conservés.
 */
export async function GET(request: NextRequest) {
  await requireUser();
  const params = request.nextUrl.searchParams;
  const agenda = params.get("agenda") === "1";
  const projectId = params.get("projectId");
  const returnTo = agenda ? "/calendrier" : projectId && isUuid(projectId) ? `/projets/${projectId}/parametres` : "/projets";

  if (!isGoogleConfigured()) redirect(`${returnTo}?google=error&reason=not_configured`);

  const required = agenda ? [CALENDAR_SCOPE] : [GOOGLE_SCOPE];
  const { state, codeChallenge } = await startOAuthFlow("google", returnTo, required);
  redirect(buildAuthUrl({ state, codeChallenge, scopes: agenda ? [CALENDAR_SCOPE, ...IDENTITY_SCOPES] : [GOOGLE_SCOPE] }));
}
