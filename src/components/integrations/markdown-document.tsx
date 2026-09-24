import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Images intégrées par l'export Google (base64). Le SVG est exclu : il peut contenir du script. */
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;

/**
 * Affichage en lecture seule d'un document Markdown (export d'un Google Doc).
 *
 * Sûr par construction : react-markdown n'interprète jamais le HTML présent dans le texte, et
 * les liens dangereux (javascript:, data: hors images…) sont neutralisés.
 */
export function MarkdownDocument({ markdown }: { markdown: string }) {
  return (
    <article className="doc-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => (key === "src" && DATA_IMAGE.test(url) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          // eslint-disable-next-line @next/next/no-img-element -- images en base64, sans intérêt pour next/image
          img: ({ node: _node, alt, ...props }) => <img {...props} alt={alt ?? ""} loading="lazy" />,
          table: ({ node: _node, ...props }) => (
            <div className="doc-table">
              <table {...props} />
            </div>
          ),
        }}
      >
        {markdown}
      </Markdown>
    </article>
  );
}
