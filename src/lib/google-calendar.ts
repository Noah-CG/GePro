import { addDays } from "./dates";

/** Au-delà, l'adresse devient trop longue pour certains navigateurs : la description est tronquée. */
const MAX_DETAILS = 1500;

/**
 * Lien « Ajouter à Google Agenda » : ouvre Google Agenda avec l'événement pré-rempli, sans API ni
 * connexion à un compte Google côté GePro. Événement sur la journée entière, du début à l'échéance
 * (ou sur la seule date connue). Renvoie null si la tâche n'a aucune date.
 */
export function googleCalendarUrl(task: {
  title: string;
  description?: string;
  startDate?: string | null;
  dueDate?: string | null;
  projectName?: string;
  /** Adresse de la tâche dans GePro, ajoutée à la description. */
  link?: string;
}): string | null {
  const due = task.dueDate || task.startDate;
  if (!due) return null;
  const start = task.startDate && task.startDate <= due ? task.startDate : due;
  // Journée entière : Google attend une fin exclusive, le lendemain du dernier jour.
  const compact = (iso: string) => iso.replaceAll("-", "");

  let description = task.description?.trim() ?? "";
  if (description.length > MAX_DETAILS) description = `${description.slice(0, MAX_DETAILS)}…`;
  const details = [
    description,
    [task.projectName && `Projet : ${task.projectName}`, task.link && `Ouvrir dans GePro : ${task.link}`].filter(Boolean).join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title.trim() || "Tâche",
    dates: `${compact(start)}/${compact(addDays(due, 1))}`,
  });
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params}`;
}
