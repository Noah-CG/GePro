/** Appels du navigateur vers les routes /api/projects/[id]/discord/* (jamais vers Discord). */
import { DISCORD_ERROR_MESSAGES, isDiscordErrorCode, type DiscordErrorCode } from "@/lib/discord/errors";

export class DiscordRequestError extends Error {
  constructor(
    readonly code: DiscordErrorCode,
    message: string,
    /** Secondes à attendre avant de réessayer (limite de débit). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "DiscordRequestError";
  }
}

type Options = { method?: "GET" | "POST"; body?: unknown; keepalive?: boolean };

export async function discordApi<T>(projectId: string, path: string, { method = "GET", body, keepalive }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/projects/${projectId}/discord/${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      keepalive,
    });
  } catch {
    throw new DiscordRequestError("network", DISCORD_ERROR_MESSAGES.network);
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const error = (data ?? {}) as { error?: unknown; message?: unknown; retryAfter?: unknown };
  const code = isDiscordErrorCode(error.error) ? error.error : "unknown";
  throw new DiscordRequestError(
    code,
    typeof error.message === "string" ? error.message : DISCORD_ERROR_MESSAGES[code],
    typeof error.retryAfter === "number" ? error.retryAfter : undefined,
  );
}

/** Délai conseillé avant la prochaine tentative (ms), si l'erreur est une limite de débit. */
export const retryDelayOf = (error: unknown) =>
  error instanceof DiscordRequestError && error.retryAfter ? error.retryAfter * 1000 : undefined;
