// RSS Feed generator (DESIGN §11.3, T14).
// Prerendered static XML feed of the latest 50 published Thai articles.
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getPublishedArticles, getAuthorById, getSiteInfo } from '../lib/content/queries';
import { buildSite } from '../shared/site';

export const prerender = true;

export const GET: APIRoute = async () => {
  const siteInfo = getSiteInfo();
  const site = buildSite();
  const articles = getPublishedArticles();

  // Sort newest first, top 50
  const sorted = [...articles]
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, 50);

  const items = sorted.map((article) => {
    const author = getAuthorById(article.authorId);
    return {
      title: article.title,
      pubDate: new Date(article.publishedAt ?? article.updatedAt),
      description: article.excerpt,
      link: `/${article.slug}/`,
      customData: author ? `<author>${author.name}</author>` : undefined,
    };
  });

  return rss({
    title: siteInfo.name,
    description: siteInfo.description,
    site: site.url,
    items,
    customData: '<language>th</language>',
  });
};
