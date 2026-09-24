"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { FolderKanban, FolderPlus, LayoutDashboard, ListTodo, Moon, Plus, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { search, type SearchResults } from "@/actions/search";
import { StatusIcon } from "@/components/ui/badges";
import { Kbd } from "@/components/ui/misc";
import { useApp } from "./app-provider";

const EMPTY: SearchResults = { projects: [], tasks: [] };

/** Recherche rapide + actions (Ctrl/Cmd + K). */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { newTask, newProject } = useApp();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Recherche côté serveur, déclenchée 200 ms après la dernière frappe.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await search(q);
      if (!cancelled) {
        setResults(res);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Réinitialise la saisie à la fermeture.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  // Actions statiques, filtrées localement.
  const actions: { label: string; icon: ReactNode; shortcut?: string; run: () => void }[] = [
    { label: "Nouvelle tâche", icon: <Plus size={16} />, shortcut: "N", run: () => newTask() },
    { label: "Nouveau projet", icon: <FolderPlus size={16} />, shortcut: "P", run: () => newProject() },
    { label: "Tableau de bord", icon: <LayoutDashboard size={16} />, run: () => router.push("/") },
    { label: "Toutes les tâches", icon: <ListTodo size={16} />, run: () => router.push("/taches") },
    { label: "Projets", icon: <FolderKanban size={16} />, run: () => router.push("/projets") },
    {
      label: resolvedTheme === "dark" ? "Passer en mode clair" : "Passer en mode sombre",
      icon: resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />,
      run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
  ];
  const q = query.trim().toLowerCase();
  const visibleActions = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  const nothing = q.length >= 2 && !loading && !visibleActions.length && !results.projects.length && !results.tasks.length;

  const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-surface-2";

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RadixDialog.Content className="fixed top-[10vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <RadixDialog.Title className="sr-only">Recherche</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">Rechercher un projet, une tâche ou une action</RadixDialog.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search size={16} className="text-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Rechercher un projet, une tâche…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              />
              <Kbd>Échap</Kbd>
            </div>
            <Command.List className="scroll-thin max-h-[60vh] overflow-y-auto p-2">
              {nothing && <p className="px-3 py-6 text-center text-sm text-muted">Aucun résultat pour « {query} »</p>}

              {results.tasks.length > 0 && (
                <Command.Group heading="Tâches" className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {results.tasks.map((t) => (
                    <Command.Item
                      key={t.id}
                      value={`task-${t.id}`}
                      onSelect={() => run(() => router.push(`/projets/${t.projectId}?tache=${t.id}`))}
                      className={item}
                    >
                      <StatusIcon status={t.status} />
                      <span className="flex-1 truncate">{t.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ background: t.projectColor }} />
                        {t.projectName}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {results.projects.length > 0 && (
                <Command.Group heading="Projets" className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {results.projects.map((p) => (
                    <Command.Item key={p.id} value={`project-${p.id}`} onSelect={() => run(() => router.push(`/projets/${p.id}`))} className={item}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.archived && <span className="text-xs text-muted">Archivé</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {visibleActions.length > 0 && (
                <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {visibleActions.map((a) => (
                    <Command.Item key={a.label} value={a.label} onSelect={() => run(a.run)} className={item}>
                      <span className="text-muted">{a.icon}</span>
                      <span className="flex-1">{a.label}</span>
                      {a.shortcut && <Kbd>{a.shortcut}</Kbd>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
