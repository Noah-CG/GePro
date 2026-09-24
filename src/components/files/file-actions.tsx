"use client";

import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteFile } from "@/actions/files";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass } from "@/components/ui/button";

/**
 * Actions de la page de lecture d'un PDF : « Télécharger » et, pour la personne qui l'a importé
 * ou un admin, « Supprimer » (deux clics : le fichier n'existe nulle part ailleurs).
 */
export function FileActions({ fileId, projectId, name, canDelete }: { fileId: string; projectId: string; name: string; canDelete: boolean }) {
  const { toast } = useApp();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await deleteFile(fileId);
      setConfirming(false);
      if (!res.ok) return toast(res.error, "error");
      toast("Fichier supprimé");
      router.push(`/projets/${projectId}/documents`);
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canDelete && (
        <Button
          size="sm"
          variant={confirming ? "danger" : "ghost"}
          onClick={remove}
          onBlur={() => setConfirming(false)}
          disabled={pending}
          aria-label={confirming ? `Confirmer la suppression de ${name}` : `Supprimer ${name}`}
        >
          <Trash2 size={14} /> {confirming ? "Confirmer la suppression" : "Supprimer"}
        </Button>
      )}
      <a href={`/api/fichiers/${fileId}?telechargement=1`} className={buttonClass({ size: "sm", variant: "primary" })}>
        <Download size={14} /> Télécharger
      </a>
    </div>
  );
}
