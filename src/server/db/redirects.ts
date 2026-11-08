import { eq, or } from 'drizzle-orm';
import type { Db } from './client';
import { redirect } from './schema';

export { findMatchingRedirect, type StaticRedirect } from '../../shared/redirects';

export interface SlugRedirect {
  reason: 'article' | 'category' | 'tag' | 'author';
  /** Old site-relative URL with a trailing slash. */
  from: string;
  /** New site-relative URL with a trailing slash. */
  to: string;
}

/**
 * Records a slug change with one-hop semantics (CONTRACTS §3, D30), as one D1 batch:
 * 1. every redirect whose `to_path` is `from` is rewritten to `to` (A→B becomes A→C);
 * 2. any redirect whose `from_path` is `to` is deleted (renaming back removes the old rule, and a
 *    rewrite that looped back, A→A, disappears with it);
 * 3. `from → to` is inserted.
 */
export async function recordSlugRedirect(
  db: Db,
  { reason, from, to }: SlugRedirect,
): Promise<void> {
  if (from === to) return;
  await db.batch([
    db.update(redirect).set({ toPath: to }).where(eq(redirect.toPath, from)),
    db.delete(redirect).where(eq(redirect.fromPath, to)),
    db
      .insert(redirect)
      .values({ fromPath: from, toPath: to, reason, createdAt: Date.now() })
      .onConflictDoUpdate({ target: redirect.fromPath, set: { toPath: to, reason } }),
  ]);
}

/**
 * Resolves a redirect from the D1 redirect table (CONTRACTS §3, D30).
 * Checks:
 * 1. Exact match for article, category, tag, or author path (with or without trailing slash)
 * 2. Listing pagination wildcard for /category/<slug>/page/<n>/, /tag/<slug>/page/<n>/, /authors/<slug>/page/<n>/
 * Returns destination path with trailing slash, or null if no redirect found.
 */
export async function resolveRedirectFromDb(db: Db, pathname: string): Promise<string | null> {
  if (!pathname) return null;

  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const withoutSlash = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  // 1. Direct exact lookup
  const exact = await db
    .select({ toPath: redirect.toPath })
    .from(redirect)
    .where(or(eq(redirect.fromPath, withSlash), eq(redirect.fromPath, withoutSlash)))
    .limit(1);

  if (exact.length > 0 && exact[0]?.toPath) {
    return exact[0].toPath;
  }

  // 2. Listing page pagination lookup: /category/<slug>/page/<n>/, /tag/<slug>/page/<n>/, /authors/<slug>/page/<n>/
  const pageMatch = /^\/(category|tag|authors)\/([^/]+)\/page\/(\d+)\/?$/.exec(pathname);
  if (pageMatch) {
    const [, section, slug, pageNum] = pageMatch;
    const fromBase = `/${section}/${slug}/`;
    const baseRedirect = await db
      .select({ toPath: redirect.toPath })
      .from(redirect)
      .where(eq(redirect.fromPath, fromBase))
      .limit(1);

    if (baseRedirect.length > 0 && baseRedirect[0]?.toPath) {
      const toBase = baseRedirect[0].toPath.replace(/\/+$/, '');
      return `${toBase}/page/${pageNum}/`;
    }
  }

  return null;
}

/**
 * A real article now owns `path`: drop any redirect whose `from_path` is that URL so the article wins.
 */
export async function releaseSlugRedirect(db: Db, path: string): Promise<void> {
  await db.delete(redirect).where(eq(redirect.fromPath, path));
}
