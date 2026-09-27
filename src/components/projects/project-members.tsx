"use client";

import { LogOut, Trash2, UserPlus } from "lucide-react";
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
import { Field, Input, Segmented } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import { SimpleSelect } from "@/components/ui/select";
import type { ProjectRole } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import type { InviteLinkView, PendingInvitation, ProjectMember } from "@/lib/queries";
import { CopyableLink } from "./copyable-link";
import { InviteLinkForm, InviteLinks } from "./invite-links";

const ROLE_LABELS: Record<ProjectRole, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };
const ROLE_OPTIONS: { value: "admin" | "member"; label: string }[] = [
  { value: "member", label: "Membre" },
  { value: "admin", label: "Administrateur" },
];

const canManage = (role: ProjectRole) => role === "owner" || role === "admin";

/**
 * Membres du projet et invitations. Tout membre voit la liste ; le propriétaire et les
 * administrateurs invitent (email exact ou lien ouvert), changent les
 * rôles et retirent des membres.
 */
export function ProjectMembers({
  projectId,
  myRole,
  members,
  invitations,
  links,
}: {
  projectId: string;
  myRole: ProjectRole;
  members: ProjectMember[];
  invitations: PendingInvitation[];
  links: InviteLinkView[];
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
      {manager && links.length > 0 && <InviteLinks links={links} />}
    </div>
  );
}

function MemberRow({ projectId, member: m, myRole }: { projectId: string; member: ProjectMember; myRole: ProjectRole }) {
  const { me, toast } = useApp();
  const [confirm, setConfirm] = useState<"remove" | "transfer" | null>(null);
  const [pending, startTransition] = useTransition();
  const self = m.id === me.id;
  // Un administrateur ne change le rôle ni ne retire un autre administrateur (le propriétaire, si).
  const editable = canManage(myRole) && !self && m.role !== "owner" && (m.role === "member" || myRole === "owner");
  const removable = editable;

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

type InviteMode = "email" | "link";
const MODE_OPTIONS: { value: InviteMode; label: string }[] = [
  { value: "email", label: "Par email" },
  { value: "link", label: "Par lien" },
];

/** Inviter : par email exact, ou en créant un lien ouvert. */
function InviteForm({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<InviteMode>("email");
  return (
    <Card className="space-y-3 p-4">
      <div className="max-w-md">
        <Segmented label="Mode d'invitation" value={mode} onChange={setMode} options={MODE_OPTIONS} />
      </div>
      {mode === "link" ? <InviteLinkForm projectId={projectId} /> : <EmailInviteForm projectId={projectId} />}
    </Card>
  );
}

function EmailInviteForm({ projectId }: { projectId: string }) {
  const { toast } = useApp();
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await inviteMember(projectId, { email: target, role });
      if (!res.ok) return setError(res.error);
      setLink(`${window.location.origin}${res.data.path}`);
      toast(`Invitation créée pour ${target.trim().toLowerCase()}`);
      setError(null);
      setTarget("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Email" htmlFor="invite-target">
            <Input
              id="invite-target"
              type="email"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="prenom.nom@exemple.fr"
              autoComplete="off"
              aria-describedby="invite-target-aide"
              aria-invalid={error ? true : undefined}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Rôle" htmlFor="invite-role">
            <SimpleSelect id="invite-role" value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
          </Field>
        </div>
        <Button type="submit" variant="primary" loading={pending} disabled={!target.trim()}>
          <UserPlus size={15} /> Inviter
        </Button>
      </div>
      {/* Hors de la rangée : sous le champ, l'aide décalerait l'email par rapport au rôle et au bouton. */}
      <p id="invite-target-aide" className="text-xs text-muted">
        L&apos;adresse exacte du compte GePro de la personne.
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {link && (
        <CopyableLink
          link={link}
          label="Lien d'invitation"
          note="Transmettez ce lien à la personne invitée (il n'est affiché qu'une fois et expire dans 7 jours). L'invitation apparaît aussi dans sa page Projets."
        />
      )}
    </form>
  );
}

function InvitationRow({ invitation: i }: { invitation: PendingInvitation }) {
  const { toast } = useApp();
  const [pending, startTransition] = useTransition();
  const target = i.email;
  const revoke = () =>
    startTransition(async () => {
      const res = await revokeInvitation(i.id);
      toast(res.ok ? `Invitation de ${target} annulée` : res.error, res.ok ? "success" : "error");
    });

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{target}</p>
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
