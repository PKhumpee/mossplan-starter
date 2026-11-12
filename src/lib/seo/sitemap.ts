import { getTagBySlug, isThinTag } from '../content/queries';

const EXCLUDED_PATHS = ['/admin', '/api', '/styleguide', '/go', '/search'];

export function isSitemapUrl(pathname: string): boolean {
  if (EXCLUDED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return false;
  }
  const match = pathname.match(/^\/tag\/([^/]+)(?:\/|$)/);
  if (!match) return true;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]!);
  } catch {
    // Malformed percent-encoding never matches a real tag slug, so keep the URL out of the sitemap.
    return false;
  }
  const tag = getTagBySlug(slug);
  return !tag || !isThinTag(tag.id);
}
