// Body headings are restricted to H2–H4 (CONTRACTS §6). H1 -> H2, H5/H6 -> H4.

export function clampHeadingLevel(level: unknown): 2 | 3 | 4 {
  const n = Number(level);
  if (Number.isNaN(n)) return 2;
  return Math.max(2, Math.min(4, Math.trunc(n))) as 2 | 3 | 4;
}

/** Rewrite <h1>/<h5>/<h6> tags in pasted HTML to the allowed range. */
export function normalizeHeadingsHtml(html: string): string {
  return html.replace(/<(\/?)h1(?=[\s>])/gi, '<$1h2').replace(/<(\/?)h[56](?=[\s>])/gi, '<$1h4');
}

interface Node {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  [key: string]: unknown;
}

/** Return a copy of a Tiptap JSON doc with heading levels clamped to 2–4. */
export function normalizeHeadingNodes<T>(doc: T): T {
  const walk = (node: Node): Node => {
    const out: Node = { ...node };
    if (node.type === 'heading') {
      out.attrs = { ...node.attrs, level: clampHeadingLevel(node.attrs?.level) };
    }
    if (Array.isArray(node.content)) out.content = node.content.map(walk);
    return out;
  };
  if (!doc || typeof doc !== 'object') return doc;
  return walk(doc as unknown as Node) as unknown as T;
}
