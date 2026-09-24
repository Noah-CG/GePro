"use client";

import { ChevronRight, KeyRound, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { createMember, deleteMember, resetMemberPassword } from "@/actions/members";
import { useApp } from "@/components/layout/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Segmented } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import type { Member } from "@/lib/queries";

export function MembersManager({ team }: { team: Member[] }) {
  const { me, toast } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<Member | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = (m: Member) => {
    if (confirmDelete !== m.id) return setConfirmDelete(m.id);
    startTransition(async () => {
      const res = await deleteMember(m.id);
      setConfirmDelete(null);
      toast(res.ok ? `${m.name} a été supprimé·e` : res.error, res.ok ? "success" : "error");
    });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <UserPlus size={16} /> Ajouter un membre
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/membres/${m.id}`} className="group flex min-w-0 flex-1 items-center gap-3" title={`Temps de travail et tâches de ${m.name}`}>
                <Avatar user={m} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-accent group-hover:underline">
                    {m.name} {m.id === me.id && <span className="font-normal text-muted">(vous)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                <ChevronRight size={15} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
              {m.role === "admin" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">Admin</span>}
              <Button size="icon" variant="ghost" title="Réinitialiser le mot de passe" aria-label={`Réinitialiser le mot de passe de ${m.name}`} onClick={() => setResetFor(m)}>
                <KeyRound size={15} />
              </Button>
              {m.id !== me.id && (
                <Button
                  size={confirmDelete === m.id ? "sm" : "icon"}
                  variant={confirmDelete === m.id ? "danger" : "ghost"}
                  onClick={() => remove(m)}
                  onBlur={() => setConfirmDelete(null)}
                  disabled={pending}
                  loading={pending && confirmDelete === m.id}
                  aria-label={`Supprimer ${m.name}`}
                >
                  <Trash2 size={15} />
                  {confirmDelete === m.id && "Confirmer"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Supprimer un membre le retire des tâches qui lui étaient assignées ; les tâches elles-mêmes sont conservées.
      </p>

      <CreateMemberDialog key={`c${createOpen}`} open={createOpen} onOpenChange={setCreateOpen} />
      <ResetPasswordDialog key={`r${resetFor?.id}`} member={resetFor} onClose={() => setResetFor(null)} />
    </>
  );
}

function CreateMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" as "member" | "admin" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createMember(form);
      if (!res.ok) return setError(res.error);
      toast(`Compte créé pour ${form.name}`);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nouveau membre" description="Communiquez-lui ensuite son email et son mot de passe.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom complet" htmlFor="m-name">
          <Input id="m-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="m-email">
          <Input id="m-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Mot de passe provisoire" htmlFor="m-pwd" hint="8 caractères minimum. Le membre pourra le changer depuis son menu.">
          <Input id="m-pwd" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label="Rôle">
          <Segmented
            label="Rôle"
            value={form.role}
            onChange={(role) => setForm({ ...form, role })}
            options={[
              { value: "member", label: "Membre" },
              { value: "admin", label: "Administrateur" },
            ]}
          />
        </Field>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending}>
            Créer le compte
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { toast } = useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    startTransition(async () => {
      const res = await resetMemberPassword(member.id, password);
      if (!res.ok) return setError(res.error);
      toast("Mot de passe réinitialisé");
      onClose();
    });
  }

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()} title={`Nouveau mot de passe pour ${member?.name ?? ""}`} description="Ses sessions ouvertes seront fermées.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nouveau mot de passe" htmlFor="r-pwd" hint="8 caractères minimum">
          <Input id="r-pwd" autoFocus type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
