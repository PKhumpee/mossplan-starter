// Shared URL redirect matching logic (CONTRACTS §3, §7, D30).
// Provides single-hop 301 resolution for exact paths, trailing-slash variations, and listing pagination.

export interface StaticRedirect {
  from: string;
  to: string;
}

/**
 * Resolves a request pathname against a list of redirect rules.
 * Supports:
 * 1. Exact match with or without trailing slash (e.g. /articles/old/ and /articles/old)
 * 2. Static non-HTML redirects (e.g. /sitemap.xml -> /sitemap-index.xml)
 * 3. Wildcard pagination for taxonomy and authors (e.g. /category/old/page/2/ -> /category/new/page/2/)
 * 4. Single-hop flattening for chained redirects (A -> B -> C resolves to C in 1 hop)
 *
 * Returns the destination path with proper trailing slash, or null if no redirect matches.
 */
export function findMatchingRedirect(
  pathname: string,
  rules: readonly StaticRedirect[],
): string | null {
  if (!pathname || rules.length === 0) return null;

  // Helper to find a direct match (exact or wildcard)
  const findDirect = (path: string): string | null => {
    const withSlash = path.endsWith('/') ? path : `${path}/`;
    const withoutSlash = path.endsWith('/') ? path.slice(0, -1) : path;

    for (const rule of rules) {
      const ruleFrom = rule.from.startsWith('/') ? rule.from : `/${rule.from}`;
      const ruleTo = rule.to.startsWith('/') ? rule.to : `/${rule.to}`;

      // 1. Exact match (both with and without trailing slash, or exact file like /sitemap.xml)
      if (ruleFrom === path || ruleFrom === withSlash || ruleFrom === withoutSlash) {
        return ruleTo;
      }

      // 2. Wildcard prefix match for taxonomy and author listing pagination (CONTRACTS §3)
      // Matches /category/<slug>/page/<n>/, /tag/<slug>/page/<n>/, /authors/<slug>/page/<n>/
      if (
        ruleFrom.startsWith('/category/') ||
        ruleFrom.startsWith('/tag/') ||
        ruleFrom.startsWith('/authors/')
      ) {
        const fromBase = ruleFrom.replace(/\/+$/, '');
        const toBase = ruleTo.replace(/\/+$/, '');
        const prefix = `${fromBase}/page/`;

        if (path.startsWith(prefix) || withSlash.startsWith(prefix)) {
          const remainder = (path.startsWith(prefix) ? path : withSlash).slice(prefix.length);
          // Match positive integer page number e.g. "2" or "2/"
          if (/^\d+\/?$/.test(remainder)) {
            const pageNum = remainder.replace(/\/+$/, '');
            return `${toBase}/page/${pageNum}/`;
          }
        }
      }
    }
    return null;
  };

  const firstTarget = findDirect(pathname);
  if (!firstTarget) return null;

  // Single-hop flattening (D30): follow chains up to 5 hops with cycle detection
  let currentTarget = firstTarget;
  const visited = new Set<string>([
    pathname,
    pathname.endsWith('/') ? pathname.slice(0, -1) : `${pathname}/`,
  ]);

  for (let hop = 0; hop < 5; hop++) {
    if (visited.has(currentTarget)) break;
    visited.add(currentTarget);
    const nextTarget = findDirect(currentTarget);
    if (!nextTarget || nextTarget === currentTarget) break;
    currentTarget = nextTarget;
  }

  return currentTarget;
}
