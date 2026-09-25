/**
 * Faux Google Agenda pour les tests : remplace fetch et garde en mémoire les agendas et leurs
 * événements (création, lecture, mise à jour, suppression), avec les codes d'erreur de Google.
 */
import { vi } from "vitest";
import { json } from "./google";

type StoredEvent = Record<string, unknown> & { id: string; status: string };
export type FakeCalendarCall = { method: string; path: string; body: unknown };

export type FakeGoogleCalendar = {
  calendars: Map<string, Map<string, StoredEvent>>;
  calls: FakeCalendarCall[];
  /** Événements visibles (non supprimés) d'un agenda. */
  events: (calendarId: string) => StoredEvent[];
};

const notFound = () => json({ error: { code: 404, message: "Not Found", errors: [{ reason: "notFound" }] } }, 404);

export function mockGoogleCalendar(): FakeGoogleCalendar {
  const calendars = new Map<string, Map<string, StoredEvent>>();
  const calls: FakeCalendarCall[] = [];
  let counter = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const path = decodeURIComponent(url.pathname.replace(/^\/calendar\/v3/, ""));
      calls.push({ method, path, body });

      if (path === "/calendars" && method === "POST") {
        const id = `gepro-${++counter}@group.calendar.google.com`;
        calendars.set(id, new Map());
        return json({ id, summary: body.summary, timeZone: body.timeZone });
      }
      const calendarMatch = path.match(/^\/calendars\/([^/]+)(\/events(?:\/([^/]+))?)?$/);
      if (!calendarMatch) throw new Error(`Route Google Agenda non simulée : ${method} ${path}`);
      const [, calendarId, eventsPart, eventId] = calendarMatch;
      const events = calendars.get(calendarId);
      if (!events) return notFound();

      if (!eventsPart) {
        if (method === "DELETE") calendars.delete(calendarId);
        return new Response(null, { status: 204 });
      }
      if (!eventId && method === "GET") {
        const items = [...events.values()].filter((e) => e.status !== "cancelled").map((e) => ({ id: e.id, extendedProperties: e.extendedProperties }));
        return json({ items });
      }
      if (!eventId && method === "POST") {
        if (events.has(body.id)) return json({ error: { code: 409, message: "The requested identifier already exists." } }, 409);
        events.set(body.id, { ...body, status: body.status ?? "confirmed" });
        return json(events.get(body.id));
      }
      const existing = eventId ? events.get(eventId) : undefined;
      if (!existing) return notFound();
      if (method === "PUT") {
        events.set(eventId!, { ...body, id: eventId!, status: body.status ?? "confirmed" });
        return json(events.get(eventId!));
      }
      if (method === "DELETE") {
        if (existing.status === "cancelled") return json({ error: { code: 410, message: "Resource has been deleted" } }, 410);
        existing.status = "cancelled";
        return new Response(null, { status: 204 });
      }
      throw new Error(`Route Google Agenda non simulée : ${method} ${path}`);
    }),
  );

  return {
    calendars,
    calls,
    events: (calendarId) => [...(calendars.get(calendarId)?.values() ?? [])].filter((e) => e.status !== "cancelled"),
  };
}
