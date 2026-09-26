"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { linkDiscordChannel, unlinkDiscordChannel } from "@/actions/discord";
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/misc";
import type { DiscordChannelView } from "@/lib/discord/model";
import { channelUrl, DISCORD_DOCS_URL } from "@/lib/discord/urls";
import { DISCORD_COLOR, DiscordIcon } from "./discord-icon";

/** Salon Discord du projet (paramètres du projet) : rattachement, changement, retrait. */
export function DiscordChannelCard({
  projectId,
  configured,
  channel,
  canManage,
}: {
  projectId: string;
  configured: boolean;
  channel: DiscordChannelView | null;
  /** Relier ou délier le salon : propriétaire et administrateurs du projet (vérifié aussi côté serveur). */
  canManage: boolean;
}) {
  const { toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showForm = canManage && configured && (!channel || editing);

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await linkDiscordChannel(projectId, input);
      if (!res.ok) return setError(res.error);
      setError(null);
      setInput("");
      setEditing(false);
      toast(`Salon #${res.data.channelName} relié au projet`);
    });
  }

  function unlink() {
    if (!confirming) return setConfirming(true);
    startTransition(async () => {
      const res = await unlinkDiscordChannel(projectId);
      setConfirming(false);
      if (!res.ok) return toast(res.error, "error");
      toast("Salon Discord délié");
    });
  }

  return (
    <Card className="p-4">
      <div id="discord" className="flex scroll-mt-6 flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: DISCORD_COLOR }}>
          <DiscordIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Discord</p>
          {!configured ? (
            <p className="text-sm text-muted">
              Non configurée sur ce serveur : voir{" "}
              <a href={DISCORD_DOCS_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
                docs/discord.md
              </a>
              .
            </p>
          ) : channel ? (
            <p className="flex items-center gap-1 text-sm text-muted">
              <CheckCircle2 size={14} className="shrink-0 text-success" />
              <span className="truncate">
                Relié au salon{" "}
                <a
                  href={channelUrl(channel.guildId, channel.channelId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-text hover:underline"
                >
                  #{channel.channelName} <ExternalLink size={12} aria-hidden />
                </a>
              </span>
            </p>
          ) : canManage ? (
            <p className="text-sm text-muted">Lisez et écrivez dans un salon Discord depuis la page du projet.</p>
          ) : (
            <p className="text-sm text-muted">Aucun salon relié. Un administrateur du projet peut en relier un.</p>
          )}
        </div>

        {canManage && configured && channel && !editing && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant={confirming ? "danger" : "ghost"} onClick={unlink} onBlur={() => setConfirming(false)} loading={pending && confirming}>
              {confirming ? "Confirmer" : "Délier"}
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              Changer de salon
            </Button>
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <label htmlFor="discord-channel" className="block text-xs font-medium text-muted">
            Identifiant ou lien du salon
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="discord-channel"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="123456789012345678 ou https://discord.com/channels/…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby="discord-channel-help"
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="primary" loading={pending} disabled={!input.trim()}>
              Relier le salon
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => {
                  setEditing(false);
                  setError(null);
                }}>
                Annuler
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <p id="discord-channel-help" className="text-xs text-muted">
            Dans Discord, activez le mode développeur (Paramètres › Avancés), puis clic droit sur le salon › « Copier l&apos;identifiant
            du salon ». Le bot GePro doit d&apos;abord être invité sur le serveur (
            <a href={DISCORD_DOCS_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
              guide de configuration
            </a>
            ).
          </p>
        </form>
      )}

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
        Le salon est partagé par toute l&apos;équipe. Les messages écrits dans GePro sont publiés sous votre nom par le webhook
        « GePro », sans notifier personne (@everyone, @here et les mentions sont désactivés).
      </p>
    </Card>
  );
}
