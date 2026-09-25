/**
 * Analyse du markdown Discord en arbre de nœuds, rendu ensuite par des composants React
 * (components/discord/message-content.tsx). Aucun HTML n'est jamais produit ni interprété :
 * le texte reste du texte, échappé par React.
 *
 * Pris en charge : **gras**, *italique* / _italique_, __souligné__, ~~barré~~, ||spoiler||,
 * `code`, ```blocs de code```, > citations et >>> citations jusqu'à la fin, liens nus, <liens>
 * et [liens masqués](https://…), mentions <@id> <@&id> <#id>, @everyone / @here, emojis
 * personnalisés <:nom:id> et <a:nom:id>, horodatages <t:1700000000:R>, échappement par \.
 */

export type InlineStyle = "bold" | "italic" | "underline" | "strike" | "spoiler";

export type MarkdownNode =
  | { type: "text"; text: string }
  | { type: "br" }
  | { type: InlineStyle; children: MarkdownNode[] }
  | { type: "code"; text: string }
  | { type: "codeBlock"; lang: string | null; text: string }
  | { type: "quote"; children: MarkdownNode[] }
  | { type: "link"; url: string; children: MarkdownNode[] }
  | { type: "userMention"; id: string }
  | { type: "roleMention"; id: string }
  | { type: "channelMention"; id: string }
  | { type: "massMention"; target: "everyone" | "here" }
  | { type: "emoji"; id: string; name: string; animated: boolean }
  | { type: "timestamp"; seconds: number; style: string };

type State = {
  /** Déjà dans une citation : Discord ne les imbrique pas. */
  inQuote: boolean;
  /** Dans le texte d'un lien masqué : pas de lien dans un lien. */
  inLink: boolean;
  depth: number;
};

type Match = { length: number; nodes: MarkdownNode[] };
type Rule = (src: string, pos: number, state: State) => Match | null;

/** Au-delà, le reste est affiché en texte brut (protège contre les imbrications pathologiques). */
const MAX_DEPTH = 12;

/** Applique une expression régulière à la position `pos` (drapeau y : ancrée à cet endroit). */
function at(regex: RegExp, src: string, pos: number): RegExpExecArray | null {
  regex.lastIndex = pos;
  return regex.exec(src);
}

const inner = (text: string, state: State): MarkdownNode[] => parseInline(text, { ...state, depth: state.depth + 1 });

/** Enveloppe un style autour d'un texte délimité par `regex` (groupe 1 = contenu). */
const styleRule =
  (type: InlineStyle, regex: RegExp): Rule =>
  (src, pos, state) => {
    const m = at(regex, src, pos);
    return m ? { length: m[0].length, nodes: [{ type, children: inner(m[1], state) }] } : null;
  };

const RULES: Rule[] = [
  // Bloc de code : ```lang\n…``` (la langue n'est reconnue que suivie d'un retour à la ligne).
  (src, pos) => {
    const m = at(/```(?:([a-z0-9_+#.-]+)\n)?\n*([\s\S]*?)\n*```/iy, src, pos);
    if (!m || (!m[2] && !m[1])) return null;
    return { length: m[0].length, nodes: [{ type: "codeBlock", lang: m[1]?.toLowerCase() ?? null, text: m[2] }] };
  },
  // Citations, uniquement en début de ligne.
  (src, pos, state) => {
    if (state.inQuote || (pos > 0 && src[pos - 1] !== "\n")) return null;
    const rest = at(/ *>>> ([\s\S]*)/y, src, pos);
    if (rest) return { length: rest[0].length, nodes: [quote(rest[1], state)] };
    const lines = at(/(?: *> [^\n]*(?:\n|$))+/y, src, pos);
    if (!lines) return null;
    const text = lines[0].replace(/\n$/, "").replace(/^ *> /gm, "");
    return { length: lines[0].length, nodes: [quote(text, state)] };
  },
  // Échappement : \* affiche une étoile.
  (src, pos) => {
    const m = at(/\\([^0-9A-Za-z\s])/y, src, pos);
    return m ? { length: 2, nodes: [{ type: "text", text: m[1] }] } : null;
  },
  (src, pos) => {
    const m = at(/(`+)([\s\S]*?[^`])\1(?!`)/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "code", text: m[2].trim() || m[2] }] } : null;
  },
  // Emoji personnalisé.
  (src, pos) => {
    const m = at(/<(a?):(\w{2,32}):(\d{17,20})>/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "emoji", animated: m[1] === "a", name: m[2], id: m[3] }] } : null;
  },
  (src, pos) => {
    const m = at(/<@!?(\d{17,20})>/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "userMention", id: m[1] }] } : null;
  },
  (src, pos) => {
    const m = at(/<@&(\d{17,20})>/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "roleMention", id: m[1] }] } : null;
  },
  (src, pos) => {
    const m = at(/<#(\d{17,20})>/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "channelMention", id: m[1] }] } : null;
  },
  (src, pos) => {
    const m = at(/<t:(-?\d{1,13})(?::([tTdDfFR]))?>/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "timestamp", seconds: Number(m[1]), style: m[2] ?? "f" }] } : null;
  },
  (src, pos) => {
    const m = at(/@(everyone|here)\b/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "massMention", target: m[1] as "everyone" | "here" }] } : null;
  },
  // Lien masqué : [texte](https://…).
  (src, pos, state) => {
    if (state.inLink) return null;
    const m = at(/\[([^\[\]\n]+)\]\(\s*<?(https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)>?\s*\)/y, src, pos);
    if (!m) return null;
    return { length: m[0].length, nodes: [{ type: "link", url: m[2], children: inner(m[1], { ...state, inLink: true }) }] };
  },
  // Lien entre chevrons (sans aperçu dans Discord).
  (src, pos, state) => {
    if (state.inLink) return null;
    const m = at(/<(https?:\/\/[^\s>]+)>/y, src, pos);
    return m ? { length: m[0].length, nodes: [link(m[1])] } : null;
  },
  // Lien nu : la ponctuation finale ne fait pas partie de l'adresse.
  (src, pos, state) => {
    if (state.inLink || (pos > 0 && /\w/.test(src[pos - 1]))) return null;
    const m = at(/https?:\/\/[^\s<]+[^<.,:;"'\]\s)]/y, src, pos);
    return m ? { length: m[0].length, nodes: [link(m[0])] } : null;
  },
  styleRule("spoiler", /\|\|([\s\S]+?)\|\|/y),
  styleRule("bold", /\*\*([\s\S]+?)\*\*(?!\*)/y),
  styleRule("underline", /__([\s\S]+?)__(?!_)/y),
  styleRule("strike", /~~([\s\S]+?)~~/y),
  // *italique* : pas d'espace juste après l'étoile ouvrante.
  styleRule("italic", /\*(?=\S)((?:\*\*[\s\S]*?\*\*|\\[\s\S]|[^\\*])+?)\*(?!\*)/y),
  // _italique_ : pas au milieu d'un mot (snake_case reste intact).
  (src, pos, state) => {
    if (pos > 0 && /[0-9A-Za-z]/.test(src[pos - 1])) return null;
    const m = at(/_((?:__[\s\S]*?__|\\[\s\S]|[^\\_])+?)_(?![0-9A-Za-z_])/y, src, pos);
    return m ? { length: m[0].length, nodes: [{ type: "italic", children: inner(m[1], state) }] } : null;
  },
  (src, pos) => (src[pos] === "\n" ? { length: 1, nodes: [{ type: "br" }] } : null),
];

function quote(text: string, state: State): MarkdownNode {
  return { type: "quote", children: parseInline(text, { ...state, inQuote: true, depth: state.depth + 1 }) };
}

function link(url: string): MarkdownNode {
  return { type: "link", url, children: [{ type: "text", text: url }] };
}

/** Caractères qui peuvent ouvrir une règle : le texte ordinaire s'arrête avant eux. */
const SPECIAL = /[\\`<\[*_~|@\n>]|https?:\/\//g;

function parseInline(src: string, state: State): MarkdownNode[] {
  if (state.depth > MAX_DEPTH) return src ? [{ type: "text", text: src }] : [];
  const nodes: MarkdownNode[] = [];
  const pushText = (text: string) => {
    const last = nodes[nodes.length - 1];
    if (last?.type === "text") last.text += text;
    else nodes.push({ type: "text", text });
  };

  let pos = 0;
  while (pos < src.length) {
    let matched: Match | null = null;
    for (const rule of RULES) {
      matched = rule(src, pos, state);
      if (matched) break;
    }
    if (matched) {
      for (const node of matched.nodes) {
        if (node.type === "text") pushText(node.text);
        else nodes.push(node);
      }
      pos += matched.length;
      continue;
    }
    // Aucune règle : texte jusqu'au prochain caractère spécial (au moins un caractère).
    SPECIAL.lastIndex = pos + 1;
    const next = SPECIAL.exec(src);
    const end = next ? next.index : src.length;
    pushText(src.slice(pos, end));
    pos = end;
  }
  return nodes;
}

export function parseDiscordMarkdown(content: string): MarkdownNode[] {
  return parseInline(content, { inQuote: false, inLink: false, depth: 0 });
}

/** Vrai si le message ne contient que des emojis personnalisés (27 au plus) : Discord les agrandit. */
export function isEmojiOnly(nodes: MarkdownNode[]): boolean {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "emoji") count++;
    else if (!(node.type === "text" && !node.text.trim())) return false;
  }
  return count > 0 && count <= 27;
}
