"use client";

import { Check, Copy, LogOut, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { deleteProject } from "@/actions/projects";
import {
  inviteMember,
  leaveProject,
  removeMember,
  revokeInvitation,
  setMemberRole,
  transferOwnership,
} from "@/actions/project-members";
import { useApp } from "@/components/layout/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { SimpleSelect } from "@/components/ui/select";
import type { ProjectRole } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import type { PendingInvitation, ProjectMember } from "@/lib/queries";

const ROLE_LABELS: Record<ProjectRole, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };
const ROLE_OPTIONS: { value: "admin" | "member"; label: string }[] = [
  { value: "member", label: "Membre" },
  { value: "admin", label: "Administrateur" },
];

const canManage = (role: ProjectRole) => role === "owner" || role === "admin";

/**
 * Membres du projet et invitations. Tout membre voit la liste ; le propriétaire et les
 * administrateurs invitent (par email exact), changent les rôles et retirent des membres.
 */
export function ProjectMembers({
  projectId,
  myRole,
  members,
  invitations,
}: {
  projectId: string;
  myRole: ProjectRole;
  members: ProjectMember[];
  invitations: PendingInvitation[];
}) {
  const manager = canManage(myRole);
  return (
    <div className="space-y-3">
      <Card>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <MemberRow key={m.id} projectId={projectId} member={m} myRole={myRole} />
          ))}
        </ul>
      </Card>
      {manager && <InviteForm projectId={projectId} />}
      {manager && invitations.length > 0 && (
        <Card>
          <p className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted">Invitations en attente</p>
          <ul className="divide-y divide-border">
            {invitations.map((i) => (
              <InvitationRow key={i.id} invitation={i} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MemberRow({ projectId, member: m, myRole }: { projectId: string; member: ProjectMember; myRole: ProjectRole }) {
  const { me, toast } = useApp();
  const [confirm, setConfirm] = useState<"remove" | "transfer" | null>(null);
  const [pending, startTransition] = useTransition();
  const self = m.id === me.id;
  const editable = canManage(myRole) && !self && m.role !== "owner";
  // Un administrateur ne retire pas un autre administrateur (le propriétaire, si).
  const removable = editable && (m.role === "member" || myRole === "owner");

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await action();
      setConfirm(null);
      toast(res.ok ? success : (res.error ?? "Erreur"), res.ok ? "success" : "error");
    });

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar user={m} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {m.name} {self && <span className="font-normal text-muted">(vous)</span>}
        </p>
        <p className="truncate text-xs text-muted">{m.email}</p>
      </div>
      {editable ? (
        <SimpleSelect
          aria-label={`Rôle de ${m.name}`}
          value={m.role as "admin" | "member"}
          onValueChange={(role) => run(() => setMemberRole(projectId, m.id, role), `${m.name} est maintenant ${ROLE_LABELS[role].toLowerCase()}`)}
          options={ROLE_OPTIONS}
          size="sm"
          className="w-40"
        />
      ) : (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{ROLE_LABELS[m.role]}</span>
      )}
      {myRole === "owner" && !self && (
        <Button
          size="sm"
          variant={confirm === "transfer" ? "danger" : "ghost"}
          onBlur={() => setConfirm(null)}
          loading={pending && confirm === "transfer"}
          onClick={() =>
            confirm === "transfer" ? run(() => transferOwnership(projectId, m.id), `${m.name} est maintenant propriétaire du projet`) : setConfirm("transfer")
          }
        >
          {confirm === "transfer" ? "Confirmer le transfert" : "Transmettre la propriété"}
        </Button>
      )}
      {removable && (
        <Button
          size={confirm === "remove" ? "sm" : "icon"}
          variant={confirm === "remove" ? "danger" : "ghost"}
          title={`Retirer ${m.name} du projet`}
          aria-label={`Retirer ${m.name} du projet`}
          onBlur={() => setConfirm(null)}
          loading={pending && confirm === "remove"}
          onClick={() => (confirm === "remove" ? run(() => removeMember(projectId, m.id), `${m.name} a été retiré·e du projet`) : setConfirm("remove"))}
        >
          {confirm === "remove" ? "Retirer" : <Trash2 size={15} />}
        </Button>
      )}
    </li>
  );
}

function InviteForm({ projectId }: { projectId: string }) {
  const { toast } = useApp();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await inviteMember(projectId, { email, role });
      if (!res.ok) return setError(res.error);
      setError(null);
      setLink(`${window.location.origin}${res.data.path}`);
      setCopied(false);
      toast(`Invitation créée pour ${email.trim().toLowerCase()}`);
      setEmail("");
    });
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Inviter par email" htmlFor="invite-email" hint="L'adresse exacte du compte GePro de la personne.">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@exemple.fr"
                autoComplete="off"
                aria-invalid={error ? true : undefined}
              />
            </Field>
          </div>
          <div className="w-44">
            <Field label="Rôle" htmlFor="invite-role">
              <SimpleSelect id="invite-role" value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={pending} disabled={!email.trim()}>
            <UserPlus size={15} /> Inviter
          </Button>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {link && (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <p className="mb-2 text-muted">
              Transmettez ce lien à la personne invitée (il n&apos;est affiché qu&apos;une fois et expire dans 7 jours). L&apos;invitation apparaît
              aussi dans sa page Projets.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" aria-label="Lien d'invitation" />
              <Button onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copié" : "Copier"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </Card>
  );
}

function InvitationRow({ invitation: i }: { invitation: PendingInvitation }) {
  const { toast } = useApp();
  const [pending, startTransition] = useTransition();
  const revoke = () =>
    startTransition(async () => {
      const res = await revokeInvitation(i.id);
      toast(res.ok ? `Invitation de ${i.email} annulée` : res.error, res.ok ? "success" : "error");
    });

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{i.email}</p>
        <p className="truncate text-xs text-muted">
          {ROLE_LABELS[i.role]} · expire le {formatDateTime(i.expiresAt)}
          {i.invitedByName && ` · invité·e par ${i.invitedByName}`}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={revoke} loading={pending}>
        Annuler
      </Button>
    </li>
  );
}

/** Quitter le projet (tout membre sauf le propriétaire) ou le supprimer (propriétaire). */
export function ProjectDangerZone({ projectId, projectName, myRole }: { projectId: string; projectName: string; myRole: ProjectRole }) {
  const { toast } = useApp();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const owner = myRole === "owner";

  function act() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = owner ? await deleteProject(projectId) : await leaveProject(projectId);
      setConfirming(false);
      if (!res.ok) return toast(res.error, "error");
      toast(owner ? `Projet « ${projectName} » supprimé` : `Vous avez quitté « ${projectName} »`);
      router.push("/projets");
    });
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 border-danger/30 p-4">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{owner ? "Supprimer le projet" : "Quitter le projet"}</p>
        <p className="text-muted">
          {owner
            ? "Supprime définitivement le projet et toutes ses données : tâches, calendrier, documents, fichiers, membres. Le temps de travail pointé est conservé, sans projet."
            : "Vous n'aurez plus accès au projet. Il faudra une nouvelle invitation pour y revenir."}
        </p>
      </div>
      <Button variant={confirming ? "danger" : "secondary"} onClick={act} onBlur={() => setConfirming(false)} loading={pending}>
        {owner ? <Trash2 size={15} /> : <LogOut size={15} />}
        {confirming ? "Confirmer" : owner ? "Supprimer le projet" : "Quitter le projet"}
      </Button>
    </Card>
  );
}
