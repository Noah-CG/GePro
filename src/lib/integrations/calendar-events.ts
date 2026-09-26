/**
 * Mise en forme des éléments GePro en événements Google Agenda : fonctions pures, sans réseau
 * ni base (testables seules). Voir calendar-sync.ts pour la synchronisation elle-même.
 */
import { createHash } from "node:crypto";
import { addDays } from "@/lib/dates";
import type { CalendarEventResource, ExistingEvent } from "./google-calendar";

/** Élément GePro affiché dans l'agenda : un événement, ou une tâche à son échéance. */
export type CalendarItem =
  | {
      kind: "event";
      id: string;
      title: string;
      description: string;
      date: string;
      color: string;
      projectId: string;
      projectName: string;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      description: string;
      date: string;
      projectId: string;
      projectName: string;
      projectColor: string;
    };

export type CalendarSource = { kind: "event" | "task"; id: string };

/**
 * Id Google d'un élément, déduit de son id GePro : on retrouve l'événement sans table de
 * correspondance. Google exige 5 à 1024 caractères parmi a-v et 0-9 : un uuid en hexadécimal
 * convient, précédé de « gpe » (événement) ou « gpt » (tâche).
 */
export const googleEventId = (source: CalendarSource) => `gp${source.kind === "event" ? "e" : "t"}${source.id.replace(/-/g, "").toLowerCase()}`;

/** Élément GePro correspondant à un id Google, ou null si l'événement n'a pas été créé par GePro. */
export function sourceOfGoogleId(googleId: string): CalendarSource | null {
  const match = googleId.match(/^gp([et])([0-9a-f]{32})$/);
  if (!match) return null;
  const hex = match[2];
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { kind: match[1] === "e" ? "event" : "task", id };
}

/** Couleurs d'événements proposées par Google Agenda (colorId 1 à 11). */
const GOOGLE_EVENT_COLORS: [string, string][] = [
  ["1", "#7986cb"],
  ["2", "#33b679"],
  ["3", "#8e24aa"],
  ["4", "#e67c73"],
  ["5", "#f6bf26"],
  ["6", "#f4511e"],
  ["7", "#039be5"],
  ["8", "#616161"],
  ["9", "#3f51b5"],
  ["10", "#0b8043"],
  ["11", "#d50000"],
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Couleur Google la plus proche d'une couleur GePro ("#rrggbb"). */
export function nearestColorId(hex: string): string | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const [r, g, b] = rgb(hex);
  let best: [string, number] = ["", Infinity];
  for (const [id, color] of GOOGLE_EVENT_COLORS) {
    const [r2, g2, b2] = rgb(color);
    const distance = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (distance < best[1]) best = [id, distance];
  }
  return best[0];
}

/** Événement Google « toute la journée » d'un élément GePro, avec l'empreinte de son contenu. */
export function toCalendarEvent(item: CalendarItem, appUrl: string | null): CalendarEventResource {
  const project = `Projet : ${item.projectName}`;
  const link = appUrl
    ? item.kind === "task"
      ? `${appUrl}/projets/${item.projectId}`
      : `${appUrl}/projets/${item.projectId}/calendrier?vue=semaine&date=${item.date}`
    : null;
  const description = [item.description.trim(), project, link ? `Ouvrir dans GePro : ${link}` : ""].filter(Boolean).join("\n\n");
  const colorId = nearestColorId(item.kind === "task" ? item.projectColor : item.color);

  const content = {
    id: googleEventId(item),
    summary: item.kind === "task" ? `Échéance : ${item.title}` : item.title,
    description,
    start: { date: item.date },
    end: { date: addDays(item.date, 1) },
    ...(colorId ? { colorId } : {}),
    transparency: "transparent" as const,
    reminders: { useDefault: false as const },
    ...(link ? { source: { title: "GePro", url: link } } : {}),
  };
  const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 16);
  return { ...content, extendedProperties: { private: { gepro: "1", geproHash: hash } } };
}

/**
 * Écart entre l'agenda Google et ce qu'il devrait contenir : événements à créer ou modifier
 * (absents ou d'empreinte différente) et à supprimer (présents mais plus attendus). Un événement
 * ajouté à la main dans l'agenda (id qui ne vient pas de GePro) n'est jamais supprimé.
 */
export function diffCalendar(desired: CalendarEventResource[], existing: ExistingEvent[]) {
  const current = new Map(existing.map((e) => [e.id, e.hash]));
  const wanted = new Set(desired.map((e) => e.id));
  return {
    upserts: desired.filter((e) => current.get(e.id) !== e.extendedProperties.private.geproHash),
    deletes: existing.filter((e) => !wanted.has(e.id) && sourceOfGoogleId(e.id) !== null).map((e) => e.id),
  };
}
