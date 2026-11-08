// /llms-full.txt endpoint (DESIGN §11.3, D32, T14).
// Full Markdown text of every published article. Max 5 MB.
import type { APIRoute } from 'astro';
import {
  getPublishedArticles,
  getAuthorById,
  getCategoryById,
  getSiteInfo,
} from '../lib/content/queries';
import { formatThaiDate } from '../lib/format/date';
import { tiptapToMarkdown } from '../lib/seo/markdown';
import { buildSite } from '../shared/site';

export const prerender = true;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const GET: APIRoute = () => {
  const siteInfo = getSiteInfo();
  const site = buildSite();

  if (site.noindex) {
    return new Response(`# ${siteInfo.name}\n`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const articles = getPublishedArticles();
  // Sort newest first
  const sorted = [...articles].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

  let header = `# ${siteInfo.name} — Full Text Archive\n\n`;
  header += `> ${siteInfo.description}\n\n`;
  header += `คลังเนื้อหาบทความฉบับเต็มของ ${siteInfo.name}\n\n---\n\n`;

  let body = header;

  for (const a of sorted) {
    const author = getAuthorById(a.authorId);
    const category = a.categoryId ? getCategoryById(a.categoryId) : undefined;
    const date = a.publishedAt ? formatThaiDate(a.publishedAt) : '';
    const url = `${site.url}/${a.slug}/`;

    let articleText = `# ${a.title}\n\n`;
    articleText += `- **URL:** ${url}\n`;
    if (author) articleText += `- **ผู้เขียน:** ${author.name}\n`;
    if (category) articleText += `- **หมวดหมู่:** ${category.name}\n`;
    if (date) articleText += `- **วันที่เผยแพร่:** ${date}\n`;
    articleText += `\n> ${a.excerpt}\n\n`;

    const markdownBody = tiptapToMarkdown(a.content as any);
    articleText += `${markdownBody}\n\n---\n\n`;

    const prospectiveLength = new TextEncoder().encode(body + articleText).length;
    if (prospectiveLength > MAX_BYTES) {
      console.warn('[llms-full.txt] reached 5 MB limit, truncating older articles');
      break;
    }

    body += articleText;
  }

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
