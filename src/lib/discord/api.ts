/**
 * Socle commun des routes /api/projects/[id]/discord/* : session, projet, salon relié, et
 * traduction des erreurs en réponses JSON `{ error, message, retryAfter? }`.
 */
import "server-only";
import { getProjectRole } from "@/lib/access";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { isDiscordConfigured } from "./client";
import { DiscordError, discordErrorMessage, httpStatusOf, type DiscordErrorCode } from "./errors";
import type { DiscordApiError } from "./model";
import { diagnoseAccessError, getProjectDiscord, type ProjectDiscordLink } from "./service";

type Handler = (ctx: { user: SessionUser; link: ProjectDiscordLink }) => Promise<Response>;

/** Réponses jamais mises en cache par le navigateur ni par un intermédiaire : elles sont personnelles. */
const NO_STORE = { "Cache-Control": "private, no-store" };

export const jsonResponse = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });

export function errorResponse(code: DiscordErrorCode, retryAfter?: number): Response {
  const body: DiscordApiError = { error: code, message: discordErrorMessage(code), ...(retryAfter ? { retryAfter } : {}) };
  const headers: Record<string, string> = { ...NO_STORE, ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) };
  return Response.json(body, { status: httpStatusOf(code), headers });
}

/**
 * Vérifie la session, l'appartenance au projet et son salon, puis exécute `handler`. Un projet
 * dont on n'est pas membre répond comme un projet inexistant (404).
 */
export async function withProjectDiscord(params: Promise<{ id: string }>, handler: Handler): Promise<Response> {
  // Pas de redirection vers /login : c'est le panneau Discord qui appelle ces adresses.
  const user = await getCurrentUser();
  if (!user) return errorResponse("unauthenticated");

  const { id } = await params;
  if (!(await getProjectRole(user.id, id))) return errorResponse("project_not_found");
  if (!isDiscordConfigured()) return errorResponse("not_configured");

  const link = await getProjectDiscord(id);
  if (!link) return errorResponse("not_linked");

  try {
    return await handler({ user, link });
  } catch (e) {
    const error = await diagnoseAccessError(e, link.guildId);
    if (error instanceof DiscordError) {
      if (error.code === "unknown" || error.code === "invalid_token") console.error("[discord]", error);
      return errorResponse(error.code, error.retryAfter);
    }
    console.error("[discord]", error);
    return errorResponse("unknown");
  }
}

/** Corps JSON de la requête, ou null s'il est illisible. */
export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
