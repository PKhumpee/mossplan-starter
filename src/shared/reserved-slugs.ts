/** Root article slugs that would shadow an application route or public asset. */
export const RESERVED_SLUGS = [
  'admin',
  'api',
  'th',
  'en',
  '_astro',
  'assets',
  'media',
  'search',
  'tag',
  'category',
  'authors',
  'page',
  'archive',
  'about',
  'contact',
  'privacy',
  'terms',
  'disclosure',
  'editorial-policy',
  'rss.xml',
  'robots.txt',
  '.well-known',
  'go',
  '404',
] as const;

export function isReservedSlug(slug: string): boolean {
  return (
    RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number]) ||
    /^sitemap.*\.xml$/.test(slug) ||
    /^llms.*\.txt$/.test(slug)
  );
}
