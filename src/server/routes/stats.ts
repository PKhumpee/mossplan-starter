// Stats API routes (CONTRACTS §5, §3, DESIGN §10.6).
// Returns traffic totals, continuous daily series, and per-article stats mapped by slug.
import { Hono } from 'hono';
import { and, asc, eq, gte, like, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireSession } from '../auth/guard';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { ok } from '../http/respond';
import type { AppEnv } from '../http/types';
import { formatUtcDay, getDaysAgoUtc, getYesterdayUtc } from '../jobs/sync-stats';

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  categoryId: z.string().optional(),
});

/** Extracts article slug from /articles/<slug>/ or /articles/<slug> */
export function extractArticleSlug(path: string): string | null {
  const match = path.match(/^\/articles\/([^/?#]+)\/?$/);
  return match?.[1] ? match[1] : null;
}

export const statsRoutes = new Hono<AppEnv>()
  .use('/admin/stats/*', requireSession)
  .use('/admin/stats', requireSession)

  // 1. GET /api/admin/stats/summary?days=30 (CONTRACTS §5)
  // Returns totals + daily continuous series + category breakdown
  .get('/admin/stats/summary', async (c) => {
    const db = getDb(c.env);
    const parsed = QuerySchema.safeParse(c.req.query());
    const days = parsed.success ? parsed.data.days : 30;

    const now = new Date();
    const endDay = getYesterdayUtc(now);
    const startDate = getDaysAgoUtc(new Date(`${endDay}T00:00:00.000Z`), days - 1);
    const startDay = formatUtcDay(startDate);

    // Query daily aggregated views and visits in date range
    const dailyRows = await db
      .select({
        day: schema.pageStatDaily.day,
        views: sql<number>`CAST(COALESCE(SUM(${schema.pageStatDaily.views}), 0) AS INTEGER)`,
        visits: sql<number>`CAST(COALESCE(SUM(${schema.pageStatDaily.visits}), 0) AS INTEGER)`,
      })
      .from(schema.pageStatDaily)
      .where(and(gte(schema.pageStatDaily.day, startDay), lte(schema.pageStatDaily.day, endDay)))
      .groupBy(schema.pageStatDaily.day)
      .orderBy(asc(schema.pageStatDaily.day));

    const dailyMap = new Map(
      dailyRows.map((r) => [r.day, { views: Number(r.views), visits: Number(r.visits) }]),
    );

    // Build complete continuous daily series
    const series: Array<{ day: string; views: number; visits: number }> = [];
    let cur = new Date(`${startDay}T00:00:00.000Z`);
    const endDate = new Date(`${endDay}T00:00:00.000Z`);

    while (cur <= endDate) {
      const d = formatUtcDay(cur);
      const found = dailyMap.get(d);
      series.push({
        day: d,
        views: found ? found.views : 0,
        visits: found ? found.visits : 0,
      });
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1));
    }

    const totalViews = series.reduce((sum, s) => sum + s.views, 0);
    const totalVisits = series.reduce((sum, s) => sum + s.visits, 0);

    // Top articles and category breakdowns
    const articlePathRows = await db
      .select({
        path: schema.pageStatDaily.path,
        views: sql<number>`CAST(COALESCE(SUM(${schema.pageStatDaily.views}), 0) AS INTEGER)`,
        visits: sql<number>`CAST(COALESCE(SUM(${schema.pageStatDaily.visits}), 0) AS INTEGER)`,
      })
      .from(schema.pageStatDaily)
      .where(
        and(
          gte(schema.pageStatDaily.day, startDay),
          lte(schema.pageStatDaily.day, endDay),
          like(schema.pageStatDaily.path, '/articles/%'),
        ),
      )
      .groupBy(schema.pageStatDaily.path);

    const slugStats = new Map<string, { views: number; visits: number; path: string }>();
    for (const r of articlePathRows) {
      const slug = extractArticleSlug(r.path);
      if (!slug) continue;
      const v = Number(r.views);
      const vi = Number(r.visits);
      const existing = slugStats.get(slug);
      if (existing) {
        existing.views += v;
        existing.visits += vi;
      } else {
        slugStats.set(slug, { views: v, visits: vi, path: r.path });
      }
    }

    // Lookup articles in DB
    const articles = await db
      .select({
        id: schema.article.id,
        slug: schema.article.slug,
        title: schema.article.title,
        status: schema.article.status,
        categoryId: schema.category.id,
        categoryName: schema.category.name,
        categorySlug: schema.category.slug,
      })
      .from(schema.article)
      .leftJoin(schema.category, eq(schema.article.categoryId, schema.category.id));

    const articleBySlug = new Map(articles.map((a) => [a.slug, a]));

    const totalArticleViews = Array.from(slugStats.values()).reduce((sum, a) => sum + a.views, 0);

    // Aggregate category stats from article reads
    const categoryStats = new Map<
      string,
      { id: string; name: string; slug: string; views: number; visits: number }
    >();

    const articleList = Array.from(slugStats.entries()).map(([slug, s]) => {
      const art = articleBySlug.get(slug);
      if (art?.categoryId && art.categoryName && art.categorySlug) {
        const cat = categoryStats.get(art.categoryId);
        if (cat) {
          cat.views += s.views;
          cat.visits += s.visits;
        } else {
          categoryStats.set(art.categoryId, {
            id: art.categoryId,
            name: art.categoryName,
            slug: art.categorySlug,
            views: s.views,
            visits: s.visits,
          });
        }
      }

      return {
        id: art?.id ?? null,
        slug,
        title: art?.title ?? slug,
        path: `/${slug}/`,
        category: art?.categoryId
          ? {
              id: art.categoryId,
              name: art.categoryName ?? '',
              slug: art.categorySlug ?? '',
            }
          : null,
        views: s.views,
        visits: s.visits,
        percentage:
          totalArticleViews > 0 ? Number(((s.views / totalArticleViews) * 100).toFixed(1)) : 0,
      };
    });

    articleList.sort((a, b) => b.views - a.views || b.visits - a.visits);

    const categories = Array.from(categoryStats.values())
      .map((c) => ({
        ...c,
        percentage:
          totalArticleViews > 0 ? Number(((c.views / totalArticleViews) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.views - a.views);

    return ok(c, {
      days,
      period: { start: startDay, end: endDay },
      totals: {
        views: totalViews,
        visits: totalVisits,
      },
      series,
      categories,
      topArticles: articleList.slice(0, 5),
    });
  })

  // 2. GET /api/admin/stats/articles?days=30 (CONTRACTS §5)
  // Returns per-article views, top first, with pagination and optional category filter
  .get('/admin/stats/articles', async (c) => {
    const db = getDb(c.env);
    const parsed = QuerySchema.safeParse(c.req.query());
    const { days, page, limit, categoryId } = parsed.success
      ? parsed.data
      : { days: 30, page: 1, limit: 20, categoryId: undefined };

    const now = new Date();
    const endDay = getYesterdayUtc(now);
    const startDate = getDaysAgoUtc(new Date(`${endDay}T00:00:00.000Z`), days - 1);
    const startDay = formatUtcDay(startDate);

    const articlePathRows = await db
      .select({
        path: schema.pageStatDaily.path,
        views: sql<number>`CAST(COALESCE(SUM(${schema.pageStatDaily.views}), 0) AS INTEGER)`,
        visits: sql<number>`CAST(COALESCE(SUM(${schema.pageStatDaily.visits}), 0) AS INTEGER)`,
      })
      .from(schema.pageStatDaily)
      .where(
        and(
          gte(schema.pageStatDaily.day, startDay),
          lte(schema.pageStatDaily.day, endDay),
          like(schema.pageStatDaily.path, '/articles/%'),
        ),
      )
      .groupBy(schema.pageStatDaily.path);

    const slugStats = new Map<string, { views: number; visits: number; path: string }>();
    for (const r of articlePathRows) {
      const slug = extractArticleSlug(r.path);
      if (!slug) continue;
      const v = Number(r.views);
      const vi = Number(r.visits);
      const existing = slugStats.get(slug);
      if (existing) {
        existing.views += v;
        existing.visits += vi;
      } else {
        slugStats.set(slug, { views: v, visits: vi, path: r.path });
      }
    }

    const articles = await db
      .select({
        id: schema.article.id,
        slug: schema.article.slug,
        title: schema.article.title,
        status: schema.article.status,
        publishedAt: schema.article.publishedAt,
        categoryId: schema.category.id,
        categoryName: schema.category.name,
        categorySlug: schema.category.slug,
      })
      .from(schema.article)
      .leftJoin(schema.category, eq(schema.article.categoryId, schema.category.id));

    const articleBySlug = new Map(articles.map((a) => [a.slug, a]));
    const totalArticleViews = Array.from(slugStats.values()).reduce((sum, a) => sum + a.views, 0);

    let items = Array.from(slugStats.entries()).map(([slug, s]) => {
      const art = articleBySlug.get(slug);
      return {
        id: art?.id ?? null,
        slug,
        title: art?.title ?? slug,
        path: `/${slug}/`,
        status: art?.status ?? null,
        publishedAt: art?.publishedAt ?? null,
        category: art?.categoryId
          ? {
              id: art.categoryId,
              name: art.categoryName ?? '',
              slug: art.categorySlug ?? '',
            }
          : null,
        views: s.views,
        visits: s.visits,
        percentage:
          totalArticleViews > 0 ? Number(((s.views / totalArticleViews) * 100).toFixed(1)) : 0,
      };
    });

    if (categoryId) {
      items = items.filter((it) => it.category?.id === categoryId);
    }

    items.sort((a, b) => b.views - a.views || b.visits - a.visits);

    const total = items.length;
    const offset = (page - 1) * limit;
    const paginatedItems = items.slice(offset, offset + limit);

    return ok(c, {
      items: paginatedItems,
      page,
      limit,
      total,
      totalViews: totalArticleViews,
    });
  });
