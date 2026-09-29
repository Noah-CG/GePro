"use client";

import { Download, FileDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { SimpleSelect, type SelectOption } from "@/components/ui/select";

type Person = { id: string; name: string; color: string };
type Period = "tout" | "dates";

/**
 * Bouton « Exporter » du tableau de bord : télécharge en PDF les entrées du journal de bord du
 * projet (les siennes ; celles d'un membre ou de toute l'équipe pour le propriétaire et les
 * administrateurs, qui reçoivent `team`), depuis le début ou entre deux dates.
 */
export function JournalExport({ projectId, meId, team, today }: { projectId: string; meId: string; team: Person[] | null; today: string }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(meId);
  const [period, setPeriod] = useState<Period>("tout");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people: SelectOption<string>[] = [
    { value: meId, label: "Mes entrées" },
    ...(team ?? []).filter((m) => m.id !== meId).map((m) => ({ value: m.id, label: m.name, dot: m.color })),
    ...(team && team.length > 1 ? [{ value: "tous", label: "Toute l'équipe", separatorBefore: true }] : []),
  ];
  const datesMissing = period === "dates" && (!from || !to);

  async function download() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (who !== meId) params.set("membre", who);
    if (period === "dates") {
      params.set("du", from);
      params.set("au", to);
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/journal?${params}`);
      if (!res.ok) {
        setError((await res.text()) || "L'export a échoué.");
        return;
      }
      // Nom proposé par le serveur (filename*=UTF-8''…), sinon un nom générique.
      const encoded = res.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const url = URL.createObjectURL(await res.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: encoded ? decodeURIComponent(encoded) : "journal.pdf" });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setOpen(false);
    } catch {
      setError("Connexion impossible. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => (setError(null), setOpen(true))}>
        <FileDown size={15} /> Exporter
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Exporter le journal de bord"
        description="Un PDF des comptes rendus du chrono : date, heure et auteur, puis le texte rédigé."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" onClick={download} loading={loading} disabled={datesMissing}>
              <Download size={15} /> Télécharger le PDF
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {people.length > 1 && (
            <Field label="Entrées de" htmlFor="export-membre">
              <SimpleSelect id="export-membre" value={who} onValueChange={setWho} options={people} />
            </Field>
          )}
          <Field label="Période" htmlFor="export-periode">
            <SimpleSelect<Period>
              id="export-periode"
              value={period}
              onValueChange={setPeriod}
              options={[
                { value: "tout", label: "Depuis le début" },
                { value: "dates", label: "Entre deux dates" },
              ]}
            />
          </Field>
          {period === "dates" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Du" htmlFor="export-du">
                <DatePicker id="export-du" value={from} onChange={setFrom} max={to || undefined} placeholder="Date de début" />
              </Field>
              <Field label="Au" htmlFor="export-au">
                <DatePicker id="export-au" value={to} onChange={setTo} min={from || undefined} placeholder="Date de fin" />
              </Field>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
