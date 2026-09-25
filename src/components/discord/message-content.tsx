"use client";

import { useMemo, useState, type ReactNode } from "react";
import { isEmojiOnly, parseDiscordMarkdown, type MarkdownNode } from "@/lib/discord/markdown";
import type { DiscordMentions } from "@/lib/discord/model";
import { emojiUrl, safeUrl } from "@/lib/discord/urls";
import { cn } from "@/lib/utils";

/**
 * Contenu d'un message Discord. Le markdown est analysé en arbre (lib/discord/markdown.ts) puis
 * rendu en éléments React : aucun HTML n'est interprété, tout le texte est échappé par React.
 */
export function MessageContent({ content, mentions }: { content: string; mentions: DiscordMentions }) {
  const nodes = useMemo(() => parseDiscordMarkdown(content), [content]);
  if (!content) return null;
  const jumbo = isEmojiOnly(nodes);
  return (
    <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      <Nodes nodes={nodes} mentions={mentions} jumbo={jumbo} />
    </div>
  );
}

function Nodes({ nodes, mentions, jumbo = false }: { nodes: MarkdownNode[]; mentions: DiscordMentions; jumbo?: boolean }) {
  return nodes.map((node, i) => <Node key={i} node={node} mentions={mentions} jumbo={jumbo} />);
}

const mentionClass = "rounded bg-[#5865F2]/15 px-0.5 font-medium text-[#4752c4] dark:text-[#c9cdfb]";

function Node({ node, mentions, jumbo }: { node: MarkdownNode; mentions: DiscordMentions; jumbo: boolean }): ReactNode {
  const children = "children" in node ? <Nodes nodes={node.children} mentions={mentions} /> : null;
  switch (node.type) {
    case "text":
      return node.text;
    case "br":
      return "\n";
    case "bold":
      return <strong className="font-semibold">{children}</strong>;
    case "italic":
      return <em>{children}</em>;
    case "underline":
      return <u>{children}</u>;
    case "strike":
      return <s>{children}</s>;
    case "spoiler":
      return <Spoiler>{children}</Spoiler>;
    case "code":
      return <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{node.text}</code>;
    case "codeBlock":
      return (
        <pre className="my-1 overflow-x-auto rounded-md border border-border bg-surface-2 p-2 font-mono text-xs leading-normal whitespace-pre">
          <code data-lang={node.lang ?? undefined}>{node.text}</code>
        </pre>
      );
    case "quote":
      return <blockquote className="my-0.5 border-l-4 border-border pl-2.5">{children}</blockquote>;
    case "link": {
      const href = safeUrl(node.url);
      if (!href) return children;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
          {children}
        </a>
      );
    }
    case "userMention":
      return <span className={mentionClass}>@{mentions.users[node.id] ?? "utilisateur inconnu"}</span>;
    case "roleMention": {
      const role = mentions.roles[node.id];
      return (
        <span className={mentionClass} style={role?.color ? { color: role.color, background: `${role.color}26` } : undefined}>
          @{role?.name ?? "rôle inconnu"}
        </span>
      );
    }
    case "channelMention":
      return <span className={mentionClass}>#{mentions.channels[node.id] ?? "salon inconnu"}</span>;
    case "massMention":
      return <span className={mentionClass}>@{node.target}</span>;
    case "emoji":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- petites images du CDN Discord, sans intérêt pour next/image
        <img
          src={emojiUrl(node.id, node.animated)}
          alt={`:${node.name}:`}
          title={`:${node.name}:`}
          loading="lazy"
          className={cn("inline-block align-bottom object-contain", jumbo ? "h-12 w-12" : "h-5 w-5")}
        />
      );
    case "timestamp":
      return <Timestamp seconds={node.seconds} style={node.style} />;
  }
}

/** Texte masqué jusqu'au clic (ou Entrée), comme dans Discord. */
function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <span className="rounded bg-surface-2 px-0.5">{children}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler : cliquer pour afficher"
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        setRevealed(true);
      }}
      className="cursor-pointer rounded bg-text px-0.5 text-transparent select-none [&_*]:invisible"
    >
      {children}
    </span>
  );
}

const TIMESTAMP_FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  t: { timeStyle: "short" },
  T: { timeStyle: "medium" },
  d: { dateStyle: "short" },
  D: { dateStyle: "long" },
  f: { dateStyle: "long", timeStyle: "short" },
  F: { dateStyle: "full", timeStyle: "short" },
};

/** Horodatage <t:…> affiché dans le fuseau et la langue du lecteur, comme dans Discord. */
function Timestamp({ seconds, style }: { seconds: number; style: string }) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const label =
    style === "R" ? relative(date) : new Intl.DateTimeFormat("fr-FR", TIMESTAMP_FORMATS[style] ?? TIMESTAMP_FORMATS.f).format(date);
  return (
    <time dateTime={date.toISOString()} className="rounded bg-surface-2 px-0.5">
      {label}
    </time>
  );
}

function relative(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  return format.format(seconds, "second");
}
