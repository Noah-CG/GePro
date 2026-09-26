"use client";

import { Check, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvitation, declineInvitation } from "@/actions/project-members";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import type { ProjectRole } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import type { ReceivedInvitation } from "@/lib/queries";

const ROLE_LABELS: Record<ProjectRole, string> = { owner: "propriétaire", admin: "administrateur", member: "membre" };

type Ref = { token: string } | { id: string };

/** Boutons Accepter / Refuser d'une invitation (par son lien ou son id). */
export function InvitationActions({ reference, projectName }: { reference: Ref; projectName: string }) {
  const { toast } = useApp();
  const router = useRouter();
  const [action, setAction] = useState<"accept" | "decline" | null>(null);
  const [pending, startTransition] = useTransition();

  const accept = () => {
    setAction("accept");
    startTransition(async () => {
      const res = await acceptInvitation(reference);
      if (!res.ok) return toast(res.error, "error");
      toast(`Bienvenue dans « ${projectName} »`);
      router.push(`/projets/${res.data.projectId}`);
    });
  };
  const decline = () => {
    setAction("decline");
    startTransition(async () => {
      const res = await declineInvitation(reference);
      if (!res.ok) return toast(res.error, "error");
      toast("Invitation refusée");
      router.push("/projets");
    });
  };

  return (
    <div className="flex gap-2">
      <Button variant="primary" size="sm" onClick={accept} loading={pending && action === "accept"} disabled={pending}>
        <Check size={14} /> Accepter
      </Button>
      <Button variant="ghost" size="sm" onClick={decline} loading={pending && action === "decline"} disabled={pending}>
        <X size={14} /> Refuser
      </Button>
    </div>
  );
}

/** Invitations en attente adressées au compte connecté (page Projets). */
export function ReceivedInvitations({ invitations }: { invitations: ReceivedInvitation[] }) {
  if (invitations.length === 0) return null;
  return (
    <Card className="mb-5">
      <p className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-medium">
        <Mail size={15} className="text-accent" /> Invitations reçues
      </p>
      <ul className="divide-y divide-border">
        {invitations.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: i.projectColor }} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{i.projectName}</p>
              <p className="truncate text-xs text-muted">
                En tant que {ROLE_LABELS[i.role]}
                {i.invitedByName && `, invité·e par ${i.invitedByName}`} · expire le {formatDateTime(i.expiresAt)}
              </p>
            </div>
            <InvitationActions reference={{ id: i.id }} projectName={i.projectName} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
