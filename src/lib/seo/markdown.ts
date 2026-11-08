// Tiptap JSON to Clean Markdown converter for /llms-full.txt (DESIGN §11.3, T14).
// Converts Tiptap AST to standard Markdown. Replaces affiliate /go/* links with plain text.
import type { TiptapNode } from '../../shared/snapshot';

export function tiptapToMarkdown(node?: TiptapNode | null): string {
  if (!node) return '';

  if (node.type === 'text') {
    let text = node.text ?? '';
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'bold') text = `**${text}**`;
        if (mark.type === 'italic') text = `*${text}*`;
        if (mark.type === 'code') text = `\`${text}\``;
        if (mark.type === 'link') {
          const href = String(mark.attrs?.href ?? '');
          // DESIGN §11.3: affiliate links as plain text without the /go/ URL
          if (href.startsWith('/go/') || href.includes('/go/')) {
            // Keep plain text without markdown link
          } else if (href) {
            text = `[${text}](${href})`;
          }
        }
      }
    }
    return text;
  }

  const children = (node.content ?? []).map((c) => tiptapToMarkdown(c));

  switch (node.type) {
    case 'doc':
      return children.join('\n\n');

    case 'paragraph':
      return children.join('');

    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level || 2)));
      const prefix = '#'.repeat(level);
      return `${prefix} ${children.join('')}`;
    }

    case 'bulletList':
      return children.join('\n');

    case 'orderedList':
      return children.map((item, i) => `${i + 1}. ${item.replace(/^-\s*/, '')}`).join('\n');

    case 'listItem':
      return `- ${children.join(' ')}`;

    case 'blockquote':
      return children
        .map((line) =>
          line
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n'),
        )
        .join('\n>\n');

    case 'codeBlock':
      return `\`\`\`\n${children.join('')}\n\`\`\``;

    case 'horizontalRule':
      return '---';

    case 'image': {
      const alt = String(node.attrs?.alt ?? '');
      const src = String(node.attrs?.src ?? '');
      return `![${alt}](${src})`;
    }

    default:
      return children.join('');
  }
}
