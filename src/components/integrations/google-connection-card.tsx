"use client";

import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { disconnectGoogle } from "@/actions/integrations";
import { useApp } from "@/components/layout/app-provider";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import type { ConnectionView } from "@/lib/queries";
import { cn } from "@/lib/utils";

export type Notice = { kind: "success" | "error"; message: string };

/** Connexion du compte Google de l'utilisateur (paramètres du projet). */
export function GoogleConnectionCard({
  projectId,
  configured,
  connection,
  notice: initialNotice,
}: {
  projectId: string;
  configured: boolean;
  connection: ConnectionView | null;
  /** Résultat du retour OAuth (?google=…), affiché une fois. */
  notice: Notice | null;
}) {
  const { toast } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [notice] = useState(initialNotice);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // Retire ?google=… de l'adresse : recharger la page ne doit pas réafficher le message.
  useEffect(() => {
    if (initialNotice) router.replace(pathname, { scroll: false });
  }, [initialNotice, pathname, router]);

  const connectHref = `/api/integrations/google/connect?projectId=${projectId}`;

  function disconnect() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await disconnectGoogle();
      setConfirming(false);
      if (!res.ok) return toast(res.error, "error");
      toast("Compte Google déconnecté");
    });
  }

  const disconnectButton = (
    <Button
      size="sm"
      variant={confirming ? "danger" : "ghost"}
      onClick={disconnect}
      onBlur={() => setConfirming(false)}
      disabled={pending}
    >
      {confirming ? "Confirmer la déconnexion" : "Déconnecter"}
    </Button>
  );

  return (
    <Card className="p-4">
      {notice && (
        <p
          role="status"
          className={cn(
            "mb-4 rounded-lg px-3 py-2 text-sm",
            notice.kind === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
          )}
        >
          {notice.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <FileText size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Google Docs</p>
          <Status configured={configured} connection={connection} />
        </div>

        {configured && !connection && (
          <a href={connectHref} className={buttonClass({ variant: "primary", size: "sm" })}>
            Connecter mon compte Google
          </a>
        )}
        {connection?.status === "active" && disconnectButton}
        {connection?.status === "needs_reauth" && (
          <div className="flex items-center gap-2">
            {disconnectButton}
            {configured && (
              <a href={connectHref} className={buttonClass({ variant: "primary", size: "sm" })}>
                Reconnecter
              </a>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
        La connexion est personnelle et en lecture seule : GePro lit uniquement le titre, le lien et la date de
        modification des documents que vous rattachez. Les documents rattachés sont visibles par toute l&apos;équipe.
      </p>
    </Card>
  );
}

function Status({ configured, connection }: { configured: boolean; connection: ConnectionView | null }) {
  if (connection?.status === "active") {
    return (
      <p className="flex items-center gap-1 text-sm text-muted">
        <CheckCircle2 size={14} className="shrink-0 text-success" />
        <span className="truncate">Connecté en tant que {connection.email || "compte Google"}</span>
      </p>
    );
  }
  if (connection?.status === "needs_reauth") {
    return (
      <p className="flex items-center gap-1 text-sm text-warning">
        <AlertTriangle size={14} className="shrink-0" />
        La connexion a expiré ou a été révoquée{connection.email && ` (${connection.email})`}. Reconnectez votre compte.
      </p>
    );
  }
  if (!configured) {
    return <p className="text-sm text-muted">Non configurée sur ce serveur : voir la section « Intégration Google Docs » du README.</p>;
  }
  return <p className="text-sm text-muted">Rattachez des Google Docs à vos projets.</p>;
}
