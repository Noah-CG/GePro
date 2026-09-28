/**
 * Détection de la cible pendant un glisser-déposer du Kanban.
 *
 * `closestCorners` (dnd-kit) compare les coins de la carte glissée à ceux de chaque colonne et de
 * chaque carte. Une colonne vide n'offre que ses propres coins, éloignés de la carte d'une
 * demi-hauteur de colonne : une carte d'une colonne voisine peut gagner alors que le pointeur est
 * dans la colonne vide. Pire, déplacer la carte change la hauteur des colonnes (grille étirée) et
 * la place de la carte elle-même, donc la cible : la carte fait des allers-retours entre deux
 * colonnes jusqu'à l'erreur React « Maximum update depth exceeded ». C'est ce qui empêchait de
 * déposer dans « Terminé » vide.
 *
 * Ici la colonne ne dépend que de l'abscisse du pointeur : celle qu'il survole, ou la plus proche
 * quand il passe dans l'espace entre deux colonnes. La position horizontale des colonnes ne bouge
 * pas quand une carte change de colonne, donc plus de boucle. Seule la place dans la colonne est
 * choisie par proximité, parmi les cartes de cette colonne.
 */
import { closestCenter, closestCorners, type CollisionDetection, type UniqueIdentifier } from "@dnd-kit/core";
import type { TaskStatus } from "@/db/schema";
import { TASK_STATUSES } from "./constants";

/** Au-delà de cette distance horizontale d'une colonne, le pointeur est hors du tableau. */
const MAX_COLUMN_DISTANCE = 48;

/** Les colonnes sont des zones de dépôt dont l'identifiant est le statut lui-même. */
export function isTaskStatus(id: UniqueIdentifier | null | undefined): id is TaskStatus {
  return (TASK_STATUSES as readonly UniqueIdentifier[]).includes(id ?? "");
}

export const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointer = args.pointerCoordinates;
  // Clavier : pas de pointeur. sortableKeyboardCoordinates s'appuie sur la détection par coins.
  if (!pointer) return closestCorners(args);

  let column: TaskStatus | undefined;
  let best = MAX_COLUMN_DISTANCE;
  for (const status of TASK_STATUSES) {
    const rect = args.droppableRects.get(status);
    if (!rect) continue;
    const distance = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right);
    if (distance <= best) [column, best] = [status, distance];
  }
  if (!column) return [];

  const cards = args.droppableContainers.filter((c) => c.data.current?.sortable?.containerId === column);
  return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [{ id: column }];
};
