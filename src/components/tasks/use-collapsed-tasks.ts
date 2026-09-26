"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = (userId: string) => `gepro:taches-repliees:${userId}`;

/**
 * Tâches repliées dans l'arbre de la vue liste, mémorisées par utilisateur dans ce navigateur
 * (localStorage). Lu après le premier rendu : le rendu serveur montre tout déplié.
 */
export function useCollapsedTasks(userId: string) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
      if (Array.isArray(stored)) setCollapsed(new Set(stored.filter((id): id is string => typeof id === "string")));
    } catch {
      // Stockage indisponible ou illisible : tout reste déplié.
    }
  }, [userId]);

  const save = useCallback(
    (next: Set<string>) => {
      setCollapsed(next);
      try {
        if (next.size) localStorage.setItem(storageKey(userId), JSON.stringify([...next]));
        else localStorage.removeItem(storageKey(userId));
      } catch {
        // Tant pis : l'état reste valable jusqu'au rechargement.
      }
    },
    [userId],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(collapsed);
      if (!next.delete(id)) next.add(id);
      save(next);
    },
    [collapsed, save],
  );

  const expand = useCallback(
    (id: string) => {
      if (!collapsed.has(id)) return;
      const next = new Set(collapsed);
      next.delete(id);
      save(next);
    },
    [collapsed, save],
  );

  return { collapsed, toggle, expand };
}
