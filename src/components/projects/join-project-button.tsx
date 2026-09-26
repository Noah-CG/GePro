"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { joinWithInviteLink } from "@/actions/project-members";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";

/** Rejoint un projet avec un lien d'invitation ouvert (après confirmation de l'utilisateur). */
export function JoinProjectButton({ token, projectName }: { token: string; projectName: string }) {
  const { toast } = useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const join = () =>
    startTransition(async () => {
      const res = await joinWithInviteLink(token);
      if (!res.ok) return toast(res.error, "error");
      toast(`Bienvenue dans « ${projectName} »`);
      router.push(`/projets/${res.data.projectId}`);
    });

  return (
    <Button variant="primary" size="sm" onClick={join} loading={pending}>
      <Check size={14} /> Rejoindre le projet
    </Button>
  );
}
