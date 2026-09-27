"use client";

import { Link2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { createInviteLink, revokeInviteLink } from "@/actions/project-members";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { SimpleSelect } from "@/components/ui/select";
import { formatDateTime } from "@/lib/dates";
import type { InviteLinkView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { INVITE_LINK_DEFAULT_DAYS, INVITE_LINK_MAX_DAYS } from "@/lib/validation";
import { CopyableLink } from "./copyable-link";

type UsesMode = "single" | "multiple" | "unlimited";
const USES_OPTIONS: { value: UsesMode; label: string }[] = [
  { value: "single", label: "Une seule personne" },
  { value: "multiple", label: "Nombre limité" },
  { value: "unlimited", label: "Illimité jusqu'à expiration" },
];

/**
 * Création d'un lien d'invitation ouvert : lié à aucun email, il fait entrer quiconque le possède,
 * toujours comme simple membre. Durée et nombre d'utilisations au choix.
 */
export function InviteLinkForm({ projectId }: { projectId: string }) {
  const { toast } = useApp();
  const [days, setDays] = useState(String(INVITE_LINK_DEFAULT_DAYS));
  const [usesMode, setUsesMode] = useState<UsesMode>("single");
  const [maxUses, setMaxUses] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const uses = usesMode === "single" ? 1 : usesMode === "unlimited" ? null : Number(maxUses);
      const res = await createInviteLink(projectId, { days: Number(days), maxUses: uses });
      if (!res.ok) return setError(res.error);
      setError(null);
      setLink(`${window.location.origin}${res.data.path}`);
      toast("Lien d'invitation créé");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted">
        Toute personne qui a ce lien peut rejoindre le projet comme <strong>membre</strong> (jamais administrateur), après avoir créé un
        compte. Révocable à tout moment.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <Field label="Valable (jours)" htmlFor="link-days">
            <Input id="link-days" type="number" min={1} max={INVITE_LINK_MAX_DAYS} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Utilisations" htmlFor="link-uses">
            <SimpleSelect id="link-uses" value={usesMode} onValueChange={setUsesMode} options={USES_OPTIONS} />
          </Field>
        </div>
        {usesMode === "multiple" && (
          <div className="w-28">
            <Field label="Maximum" htmlFor="link-max">
              <Input id="link-max" type="number" min={2} max={500} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </Field>
          </div>
        )}
        <Button type="submit" variant="primary" loading={pending}>
          <Link2 size={15} /> Créer le lien
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {link && (
        <CopyableLink
          link={link}
          label="Lien d'invitation ouvert"
          note="Copiez ce lien maintenant : il n'est affiché qu'une fois. Il apparaît ci-dessous dans « Liens d'invitation », d'où vous pouvez le révoquer."
        />
      )}
    </form>
  );
}

const STATE_LABELS: Record<InviteLinkView["state"], string> = {
  active: "Actif",
  expired: "Expiré",
  revoked: "Révoqué",
  exhausted: "Épuisé",
};

/** Liens d'invitation du projet, avec leur journal : création, puis chaque personne entrée. */
export function InviteLinks({ links }: { links: InviteLinkView[] }) {
  return (
    <Card>
      <p className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted">Liens d&apos;invitation</p>
      <ul className="divide-y divide-border">
        {links.map((l) => (
          <InviteLinkRow key={l.id} link={l} />
        ))}
      </ul>
    </Card>
  );
}

function InviteLinkRow({ link: l }: { link: InviteLinkView }) {
  const { toast } = useApp();
  const [pending, startTransition] = useTransition();
  const revoke = () =>
    startTransition(async () => {
      const res = await revokeInviteLink(l.id);
      toast(res.ok ? "Lien révoqué" : res.error, res.ok ? "success" : "error");
    });

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            l.state === "active" ? "bg-success-soft text-success" : "bg-surface-2 text-muted",
          )}
        >
          {STATE_LABELS[l.state]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate">
            {l.useCount} / {l.maxUses ?? "∞"} utilisation{(l.maxUses ?? 2) > 1 ? "s" : ""} · expire le {formatDateTime(l.expiresAt)}
          </p>
          <p className="truncate text-xs text-muted">
            Créé le {formatDateTime(l.createdAt)}
            {l.createdByName && ` par ${l.createdByName}`}
          </p>
        </div>
        {l.state === "active" && (
          <Button size="sm" variant="ghost" onClick={revoke} loading={pending}>
            Révoquer
          </Button>
        )}
      </div>
      {l.uses.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-l-2 border-border pl-3 text-xs text-muted">
          {l.uses.map((u) => (
            <li key={`${u.name}-${u.usedAt}`}>
              {u.name} a rejoint le projet le {formatDateTime(u.usedAt)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
