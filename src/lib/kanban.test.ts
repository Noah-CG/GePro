import type { Active, ClientRect, DroppableContainer, UniqueIdentifier } from "@dnd-kit/core";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { taskStatus } from "@/db/schema";
import { STATUS_LABEL, STATUSES, TASK_STATUSES } from "./constants";
import { isTaskStatus, kanbanCollisionDetection } from "./kanban";
import { moveTaskInput, taskInput } from "./validation";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

describe("colonnes du Kanban → statuts", () => {
  it("les colonnes, la validation, le schéma Drizzle et l'enum en base utilisent les mêmes statuts", async () => {
    expect(STATUSES.map((s) => s.value)).toEqual([...TASK_STATUSES]);
    expect([...taskStatus.enumValues]).toEqual([...TASK_STATUSES]);
    // Enum réel de la base, après toutes les migrations du dossier drizzle/.
    const { rows } = await db.execute<{ value: string }>(sql`select unnest(enum_range(null::task_status))::text as value`);
    expect(rows.map((r) => r.value)).toEqual([...TASK_STATUSES]);
  });

  it("la colonne « Terminé » correspond au statut done", () => {
    expect(STATUSES.find((s) => s.label === "Terminé")?.value).toBe("done");
    expect(STATUS_LABEL.done).toBe("Terminé");
  });

  it("chaque colonne est acceptée par le serveur, une variante d'orthographe est refusée", () => {
    for (const status of TASK_STATUSES) {
      expect(moveTaskInput.safeParse({ status }).success).toBe(true);
      expect(taskInput.safeParse({ projectId: crypto.randomUUID(), title: "T", status }).success).toBe(true);
    }
    for (const status of ["terminee", "terminée", "completed", "Done", "DONE", "in-progress"]) {
      expect(moveTaskInput.safeParse({ status }).success).toBe(false);
      expect(isTaskStatus(status)).toBe(false);
    }
  });
});

// Trois colonnes côte à côte de 300 × 600 px (écart 16 px), cartes de 280 × 80 px.
const rect = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const COLUMN_LEFT = { todo: 0, in_progress: 316, done: 632 } as const;
const columnRect = (status: keyof typeof COLUMN_LEFT) => rect(COLUMN_LEFT[status], 0, 300, 600);
const cardRect = (status: keyof typeof COLUMN_LEFT, index: number) => rect(COLUMN_LEFT[status] + 10, 50 + index * 90, 280, 80);

type Board = Partial<Record<keyof typeof COLUMN_LEFT, string[]>>;

function detect(board: Board, pointer: { x: number; y: number } | null, dragged: ClientRect) {
  const rects = new Map<UniqueIdentifier, ClientRect>();
  const containers: DroppableContainer[] = [];
  const add = (id: string, r: ClientRect, containerId?: string) => {
    rects.set(id, r);
    containers.push({
      id,
      key: id,
      disabled: false,
      node: { current: null },
      rect: { current: r },
      data: { current: containerId ? { sortable: { containerId, index: 0, items: [] } } : undefined },
    } as unknown as DroppableContainer);
  };
  for (const status of TASK_STATUSES) {
    add(status, columnRect(status));
    (board[status] ?? []).forEach((id, i) => add(id, cardRect(status, i), status));
  }
  const active = { id: "glissée", data: { current: undefined }, rect: { current: { initial: dragged, translated: dragged } } } as unknown as Active;
  return kanbanCollisionDetection({
    active,
    collisionRect: dragged,
    droppableRects: rects,
    droppableContainers: containers,
    pointerCoordinates: pointer,
  }).map((c) => c.id);
}

describe("kanbanCollisionDetection", () => {
  it("colonne « Terminé » vide : la cible est la colonne, même si une carte voisine est plus proche par les coins", () => {
    const board: Board = { todo: ["a1", "a2"], in_progress: ["e1", "e2", "e3"] };
    // Pointeur au milieu de « Terminé », la carte glissée déborde un peu vers « En cours ».
    const dragged = rect(560, 260, 280, 80);
    expect(detect(board, { x: 780, y: 300 }, dragged)[0]).toBe("done");
  });

  it("colonne « Terminé » remplie : la cible est la carte la plus proche de cette colonne", () => {
    const board: Board = { todo: ["a1"], done: ["t1", "t2"] };
    expect(detect(board, { x: 780, y: 190 }, rect(642, 150, 280, 80))[0]).toBe("t2");
  });

  it("ne choisit jamais une carte d'une autre colonne que celle sous le pointeur", () => {
    const board: Board = { todo: ["a1"], in_progress: ["e1", "e2", "e3", "e4", "e5"], done: ["t1"] };
    for (let y = 10; y < 600; y += 40) {
      const target = detect(board, { x: 700, y }, rect(560, y - 40, 280, 80))[0];
      expect(target === "done" || target === "t1").toBe(true);
    }
  });

  it("entre deux colonnes : la colonne la plus proche du pointeur", () => {
    const board: Board = { in_progress: ["e1"] };
    expect(detect(board, { x: 628, y: 300 }, rect(488, 260, 280, 80))[0]).toBe("done");
    expect(detect(board, { x: 619, y: 300 }, rect(479, 260, 280, 80))[0]).toBe("e1");
  });

  it("la carte glissée ne décide pas de la colonne (plus d'allers-retours)", () => {
    // Pointeur dans l'espace « En cours » | « Terminé », plus près de « Terminé » ; la carte glissée
    // (« glissée ») vient d'être placée dans « En cours » et chevauche surtout cette colonne.
    const board: Board = { in_progress: ["e1", "glissée"] };
    expect(detect(board, { x: 626, y: 150 }, rect(440, 110, 280, 80))[0]).toBe("done");
    // Même pointeur, carte placée dans « Terminé » : même réponse.
    expect(detect({ in_progress: ["e1"], done: ["glissée"] }, { x: 626, y: 150 }, rect(440, 110, 280, 80))[0]).toBe("glissée");
  });

  it("pointeur hors du tableau : aucune cible (le dépôt est annulé)", () => {
    expect(detect({ todo: ["a1"] }, { x: 2000, y: 2000 }, rect(1900, 1960, 280, 80))).toEqual([]);
  });

  it("au clavier (sans pointeur) : détection par coins inchangée", () => {
    const board: Board = { done: ["t1"] };
    expect(detect(board, null, cardRect("done", 0))[0]).toBe("t1");
  });
});
