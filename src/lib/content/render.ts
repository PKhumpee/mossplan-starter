// Allowlist renderer from Tiptap JSON to safe HTML (CONTRACTS §6).
// Enforces allowed nodes/marks, escapes text/attributes, validates link protocols (no XSS),
// and generates stable fragment IDs for headings.

import { ALLOWED_MARKS, ALLOWED_NODES, type TiptapNode } from '../../shared/snapshot';
import {
  parseMediaReference,
  renderPublicPicture,
  resolvePublicMediaUrl,
} from '../media/public-image';

export { parseMediaReference, renderPublicPicture, resolvePublicMediaUrl };

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export interface AffiliateLinkInfo {
  id: string;
  slug: string;
  merchantName?: string;
  merchantHosts?: string[];
  status: 'active' | 'paused' | 'broken' | string;
}

export interface RenderOptions {
  affiliateLinks?: AffiliateLinkInfo[] | Map<string, AffiliateLinkInfo>;
  articleTitle?: string;
  articleSlug?: string;
  mediaUrlResolver?: (mediaId: string, rawSrc?: string) => string;
}

export interface RenderResult {
  html: string;
  headings: HeadingItem[];
  hasVideo: boolean;
}

/** HTML entity escaping for text and attributes. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes author bio as plain text with preserved line breaks. */
export function escapeBio(bio: string): string {
  return escapeHtml(bio);
}

/** Validates that an href uses only safe protocols (http, https, mailto, tel) or safe relative paths (/path, #anchor). Disallows javascript:, data:, protocol-relative //, etc. */
export function isSafeHref(href: unknown): boolean {
  if (typeof href !== 'string') return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  // Match safe protocols (case-insensitive)
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(trimmed)) return true;
  // Match root-relative internal links (/articles/..., but not protocol-relative //example.com)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  // Match fragment anchors (#section)
  if (trimmed.startsWith('#')) return true;
  return false;
}

/** Generates a stable fragment anchor ID from heading text. Supports Thai and Latin characters. */
export function generateHeadingId(text: string, usedIds: Set<string>): string {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[\s\t\n]+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}_-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const base = clean || 'section';
  let id = base;
  let counter = 1;
  while (usedIds.has(id)) {
    id = `${base}-${counter++}`;
  }
  usedIds.add(id);
  return id;
}

/** Extracts plain text from a Tiptap node and its children. */
export function extractNodeText(node?: TiptapNode | null): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (!node.content || !Array.isArray(node.content)) return '';
  return node.content.map((c) => extractNodeText(c)).join('');
}

export class TiptapRenderer {
  private readonly usedIds = new Set<string>();
  readonly headings: HeadingItem[] = [];
  hasVideo = false;
  private affiliateLinksMap?: Map<string, AffiliateLinkInfo>;
  private articleName = 'unnamed article';
  private mediaUrlResolver?: (mediaId: string, rawSrc?: string) => string;

  constructor(options?: RenderOptions) {
    if (options) {
      this.setOptions(options);
    }
  }

  setOptions(options: RenderOptions): void {
    if (options.articleTitle) {
      this.articleName = options.articleTitle;
    } else if (options.articleSlug) {
      this.articleName = options.articleSlug;
    }
    if (options.mediaUrlResolver) {
      this.mediaUrlResolver = options.mediaUrlResolver;
    }
    if (options.affiliateLinks) {
      if (options.affiliateLinks instanceof Map) {
        this.affiliateLinksMap = options.affiliateLinks;
      } else if (Array.isArray(options.affiliateLinks)) {
        this.affiliateLinksMap = new Map();
        for (const link of options.affiliateLinks) {
          this.affiliateLinksMap.set(link.id, link);
        }
      }
    }
  }

  render(doc: unknown, options?: RenderOptions): RenderResult {
    if (options) {
      this.setOptions(options);
    }
    this.usedIds.clear();
    this.headings.length = 0;
    this.hasVideo = false;

    if (!doc || typeof doc !== 'object' || (doc as { type?: string }).type !== 'doc') {
      return { html: '', headings: [], hasVideo: false };
    }

    const node = doc as TiptapNode;
    const html = (node.content ?? []).map((child) => this.renderNode(child)).join('');
    return {
      html,
      headings: [...this.headings],
      hasVideo: this.hasVideo,
    };
  }

  private renderNode(node: TiptapNode): string {
    if (!node || typeof node !== 'object') return '';

    // Reject unknown node types
    if (!ALLOWED_NODES.includes(node.type as (typeof ALLOWED_NODES)[number])) {
      console.warn(`[render] unknown node type discarded: ${String(node.type)}`);
      return '';
    }

    switch (node.type) {
      case 'doc':
        return (node.content ?? []).map((c) => this.renderNode(c)).join('');

      case 'paragraph': {
        const inner = (node.content ?? []).map((c) => this.renderNode(c)).join('');
        return `<p>${inner}</p>`;
      }

      case 'text': {
        const raw = node.text ?? '';
        let escaped = escapeHtml(raw);
        if (node.marks && Array.isArray(node.marks)) {
          for (const mark of node.marks) {
            escaped = this.applyMark(escaped, mark);
          }
        }
        return escaped;
      }

      case 'heading': {
        const levelRaw = Number(node.attrs?.level);
        // Headings in body content are strictly levels 2–4 (CONTRACTS §6, DESIGN §9.2).
        // H1 is reserved for the article title.
        const level = Math.max(2, Math.min(4, isNaN(levelRaw) ? 2 : levelRaw));
        const textContent = extractNodeText(node);
        const id = generateHeadingId(textContent, this.usedIds);
        this.headings.push({ id, text: textContent, level });
        const inner = (node.content ?? []).map((c) => this.renderNode(c)).join('');
        return `<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`;
      }

      case 'bulletList':
        return `<ul>${(node.content ?? []).map((c) => this.renderNode(c)).join('')}</ul>`;

      case 'orderedList':
        return `<ol>${(node.content ?? []).map((c) => this.renderNode(c)).join('')}</ol>`;

      case 'listItem':
        return `<li>${(node.content ?? []).map((c) => this.renderNode(c)).join('')}</li>`;

      case 'blockquote':
        return `<blockquote>${(node.content ?? []).map((c) => this.renderNode(c)).join('')}</blockquote>`;

      case 'codeBlock': {
        const inner = (node.content ?? []).map((c) => this.renderNode(c)).join('');
        return `<pre tabindex="0"><code>${inner}</code></pre>`;
      }

      case 'hardBreak':
        return '<br />';

      case 'horizontalRule':
        return '<hr />';

      case 'image': {
        const rawMediaId = String(node.attrs?.mediaId ?? '');
        const rawSrc = String(node.attrs?.src ?? '');
        const mediaId = rawMediaId || parseMediaReference(rawSrc);
        const alt = String(node.attrs?.alt ?? '');
        const caption = node.attrs?.caption ? String(node.attrs.caption) : null;
        const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';

        let pictureHtml = '';
        if (this.mediaUrlResolver) {
          const resolved = this.mediaUrlResolver(mediaId, rawSrc);
          const safeMediaIdAttr = mediaId ? ` data-media-id="${escapeHtml(mediaId)}"` : '';
          pictureHtml = `<div class="responsive-image-stub"${safeMediaIdAttr}><img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" /></div>`;
        } else {
          pictureHtml = renderPublicPicture({
            mediaId,
            src: rawSrc,
            alt,
            class: 'article-body-image',
          });
        }

        return `<figure class="article-image">${pictureHtml}${captionHtml}</figure>`;
      }

      case 'youtube': {
        this.hasVideo = true;
        const videoId = String(node.attrs?.videoId ?? '');
        const safeVideoId = escapeHtml(videoId);
        return `<div class="youtube-facade" data-video-id="${safeVideoId}"><button type="button" class="group relative block aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface shadow-card transition-all hover:shadow-elevated" aria-label="เปิดวิดีโอ YouTube"><img src="https://i.ytimg.com/vi/${safeVideoId}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102" /><span class="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/35"><span class="flex size-14 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-elevated transition-transform duration-200 group-hover:scale-108"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72L19 12z"></path></svg></span></span></button></div>`;
      }

      default:
        return '';
    }
  }

  private applyMark(
    content: string,
    mark: { type: string; attrs?: Record<string, unknown> },
  ): string {
    if (!ALLOWED_MARKS.includes(mark.type as (typeof ALLOWED_MARKS)[number])) {
      return content;
    }

    switch (mark.type) {
      case 'bold':
        return `<strong>${content}</strong>`;
      case 'italic':
        return `<em>${content}</em>`;
      case 'underline':
        return `<u>${content}</u>`;
      case 'strike':
        return `<s>${content}</s>`;
      case 'code':
        return `<code>${content}</code>`;
      case 'link': {
        const href = mark.attrs?.href;
        if (!isSafeHref(href)) {
          // Dangerous protocol (javascript:, data:) or invalid href: do not render link
          return content;
        }
        const safeHref = escapeHtml(String(href));
        const relParts = ['noopener'];
        if (mark.attrs?.nofollow === true) relParts.push('nofollow');
        return `<a href="${safeHref}" rel="${relParts.join(' ')}">${content}</a>`;
      }
      case 'affiliateLink': {
        const linkId = mark.attrs?.linkId ? String(mark.attrs.linkId) : undefined;
        let slug = mark.attrs?.slug ? String(mark.attrs.slug) : undefined;
        let status = mark.attrs?.status ? String(mark.attrs.status) : undefined;

        if (linkId) {
          const link = this.affiliateLinksMap?.get(linkId);
          if (!link) {
            // Unknown linkId → build failure naming the article (AFFILIATE §5)
            throw new Error(
              `[build] Unknown affiliate linkId "${linkId}" in article "${this.articleName}".`,
            );
          }
          slug = link.slug;
          status = link.status;
        } else if (slug && this.affiliateLinksMap) {
          let found: AffiliateLinkInfo | undefined;
          for (const l of this.affiliateLinksMap.values()) {
            if (l.slug === slug) {
              found = l;
              break;
            }
          }
          if (found) {
            status = found.status;
          }
        } else if (!slug && !linkId) {
          throw new Error(
            `[build] Invalid affiliateLink mark without linkId in article "${this.articleName}".`,
          );
        }

        const effectiveStatus = status || 'active';
        if (effectiveStatus !== 'active') {
          // Paused or broken link → the text only, plus a build warning naming the article.
          console.warn(
            `[build] Affiliate link "${linkId || slug}" (status: ${effectiveStatus}) in article "${this.articleName}" is not active; rendering text only.`,
          );
          return content;
        }

        const safeSlug = escapeHtml(slug || '');
        return `<a href="/go/${safeSlug}/" rel="sponsored nofollow noopener" data-aff>${content}</a>`;
      }
      default:
        return content;
    }
  }
}

/** Convenience function to render a Tiptap document to HTML and extract headings. */
export function renderContent(doc: unknown, options?: RenderOptions): RenderResult {
  return new TiptapRenderer(options).render(doc);
}
