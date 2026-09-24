"use client";

import { Plus } from "lucide-react";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";

export function NewProjectButton() {
  const { newProject } = useApp();
  return (
    <Button variant="primary" onClick={newProject}>
      <Plus size={16} /> Nouveau projet
      <span className="hidden opacity-70 md:inline">
        <Kbd>P</Kbd>
      </span>
    </Button>
  );
}
