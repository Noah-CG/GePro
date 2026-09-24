import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildAuthUrl, isGoogleConfigured } from "@/lib/integrations/google";
import { startOAuthFlow } from "@/lib/integrations/oauth";
import { isUuid } from "@/lib/validation";

/** Démarre la connexion d'un compte Google : redirection vers l'écran de consentement. */
export async function GET(request: NextRequest) {
  await requireUser();
  const projectId = request.nextUrl.searchParams.get("projectId");
  const returnTo = projectId && isUuid(projectId) ? `/projets/${projectId}/parametres` : "/projets";

  if (!isGoogleConfigured()) redirect(`${returnTo}?google=error&reason=not_configured`);

  const { state, codeChallenge } = await startOAuthFlow("google", returnTo);
  redirect(buildAuthUrl({ state, codeChallenge }));
}
