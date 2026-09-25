import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getConnection, saveGoogleConnection } from "@/lib/integrations/connections";
import { reportIntegrationError, type IntegrationErrorCode } from "@/lib/integrations/errors";
import { CALENDAR_SCOPE, exchangeCode, getAccountFromGrant, hasScope, revokeToken } from "@/lib/integrations/google";
import { takeOAuthFlow } from "@/lib/integrations/oauth";

/**
 * Retour de Google après le consentement. On revient toujours sur la page d'origine, avec
 * `?google=connected` ou `?google=error&reason=<code>` (la page affiche le message associé).
 */
export async function GET(request: NextRequest) {
  const me = await requireUser();
  const params = request.nextUrl.searchParams;
  const flow = await takeOAuthFlow("google");
  const returnTo = flow?.returnTo ?? "/projets";

  const reason = await connect(me.id, flow, params);
  // redirect() lève une exception interne à Next : il reste hors de tout try/catch.
  redirect(reason ? `${returnTo}?google=error&reason=${reason}` : `${returnTo}?google=connected`);
}

/** Renvoie null si la connexion est enregistrée, sinon le code d'erreur à afficher. */
async function connect(
  userId: string,
  flow: Awaited<ReturnType<typeof takeOAuthFlow>>,
  params: URLSearchParams,
): Promise<IntegrationErrorCode | null> {
  if (!flow || params.get("state") !== flow.state) return "invalid_state";
  // Refus sur l'écran de consentement, ou autre erreur renvoyée par Google.
  const error = params.get("error");
  if (error) return error === "access_denied" ? "access_denied" : "unknown";
  const code = params.get("code");
  if (!code) return "invalid_state";

  try {
    const tokens = await exchangeCode(code, flow.verifier);
    const missing = flow.requiredScopes.find((scope) => !hasScope(tokens.scope, scope));
    if (missing) {
      // Autorisation incrémentale : la révoquer retirerait aussi les droits accordés auparavant
      // (Google Docs). On ne la révoque que si le membre n'avait pas encore de connexion.
      if (!(await getConnection(userId, "google"))) await revokeToken(tokens.refreshToken ?? tokens.accessToken);
      return missing === CALENDAR_SCOPE ? "missing_calendar_scope" : "missing_scope";
    }
    await saveGoogleConnection(userId, tokens, await getAccountFromGrant(tokens.accessToken, tokens.scope));
    return null;
  } catch (e) {
    const reason = reportIntegrationError(e);
    // À cette étape, invalid_grant signifie un code expiré ou déjà utilisé, pas une révocation.
    return reason === "reauth_required" ? "invalid_state" : reason;
  }
}
