"use client";

import { Plus } from "lucide-react";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";

/** Bouton "Nouvelle tâche" des en-têtes de page (le projet courant est pré-sélectionné). */
export function NewTaskButton() {
  const { newTask } = useApp();
  return (
    // Masqué sur mobile : le bouton flottant "+" de la barre du bas le remplace.
    <span className="hidden md:block">
      <Button variant="primary" onClick={() => newTask()}>
        <Plus size={16} /> Nouvelle tâche
        <span className="opacity-70">
          <Kbd>N</Kbd>
        </span>
      </Button>
    </span>
  );
}
