/**
 * Client Google Agenda (API v3), en appels REST directs comme pour Drive. Avec le droit
 * `calendar.app.created`, GePro ne peut agir que sur les agendas qu'il a créés.
 */
import "server-only";
import { IntegrationError } from "./errors";
import { readJson, send, toIntegrationError } from "./google";

const CALENDAR_URL = "https://www.googleapis.com/calendar/v3";

/** Événement « toute la journée » tel que GePro l'écrit dans Google Agenda. */
export type CalendarEventResource = {
  id: string;
  summary: string;
  description: string;
  /** Jour de début et lendemain du dernier jour ("YYYY-MM-DD", fin exclusive). */
  start: { date: string };
  end: { date: string };
  colorId?: string;
  /** Événements à la journée : ne rendent pas la personne « occupée ». */
  transparency: "transparent";
  /** Pas de rappel : l'agenda reflète GePro sans ajouter de notifications. */
  reminders: { useDefault: false };
  source?: { title: string; url: string };
  extendedProperties: { private: { gepro: "1"; geproHash: string } };
};

/** Événement existant dans l'agenda GePro, tel que lu pour la synchronisation complète. */
export type ExistingEvent = { id: string; hash: string | null };

async function request<T>(accessToken: string, method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const url = `${CALENDAR_URL}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
  const res = await send(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await readJson(res);
  if (!res.ok) throw toIntegrationError(res.status, data);
  return data as T;
}

const statusOf = (error: unknown) => (error instanceof IntegrationError ? error.httpStatus : undefined);

/** Crée l'agenda « GePro » dans le compte du membre et renvoie son id. */
export async function createCalendar(accessToken: string, timeZone: string): Promise<string> {
  const calendar = await request<{ id?: string }>(accessToken, "POST", "/calendars", {
    summary: "GePro",
    description: "Événements et échéances des projets GePro. Synchronisé automatiquement : les modifications faites ici seront écrasées.",
    timeZone,
  });
  if (!calendar.id) throw new IntegrationError("unknown", "agenda créé sans id");
  return calendar.id;
}

/** Supprime l'agenda « GePro » (arrêt de la synchronisation). Déjà supprimé : sans erreur. */
export async function deleteCalendar(accessToken: string, calendarId: string): Promise<void> {
  try {
    await request(accessToken, "DELETE", `/calendars/${encodeURIComponent(calendarId)}`);
  } catch (e) {
    if (statusOf(e) !== 404 && statusOf(e) !== 410) throw e;
  }
}

/** Tous les événements de l'agenda GePro (id et empreinte), page par page. */
export async function listEvents(accessToken: string, calendarId: string): Promise<ExistingEvent[]> {
  const events: ExistingEvent[] = [];
  let pageToken: string | undefined;
  do {
    const page = await request<{
      items?: { id: string; extendedProperties?: { private?: Record<string, string> } }[];
      nextPageToken?: string;
    }>(accessToken, "GET", `/calendars/${encodeURIComponent(calendarId)}/events`, undefined, {
      maxResults: "2500",
      showDeleted: "false",
      fields: "items(id,extendedProperties/private),nextPageToken",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.items ?? []) events.push({ id: item.id, hash: item.extendedProperties?.private?.geproHash ?? null });
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

/**
 * Crée ou remplace un événement à id fixé par GePro. On tente d'abord la mise à jour (cas le
 * plus fréquent) ; absent, il est créé. Un événement supprimé garde son id chez Google : la
 * création répond alors 409 et la mise à jour le fait revenir.
 */
export async function upsertEvent(accessToken: string, calendarId: string, event: CalendarEventResource): Promise<void> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${event.id}`;
  const full = { ...event, status: "confirmed" };
  try {
    await request(accessToken, "PUT", path, full);
    return;
  } catch (e) {
    if (statusOf(e) !== 404) throw e;
  }
  try {
    await request(accessToken, "POST", `/calendars/${encodeURIComponent(calendarId)}/events`, full);
  } catch (e) {
    if (statusOf(e) !== 409) throw e;
    await request(accessToken, "PUT", path, full);
  }
}

/** Supprime un événement ; déjà absent ou supprimé : sans erreur. */
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await request(accessToken, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
  } catch (e) {
    if (statusOf(e) !== 404 && statusOf(e) !== 410) throw e;
  }
}

/** L'agenda n'existe plus (supprimé par le membre dans Google Agenda). */
export const isCalendarGone = (error: unknown) => statusOf(error) === 404 || statusOf(error) === 410;
