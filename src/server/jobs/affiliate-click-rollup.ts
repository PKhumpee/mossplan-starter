// Daily affiliate click roll-up job (CONTRACTS §1a, §3, AFFILIATE §4, §8, D23).
// Aggregates yesterday's affiliate_click rows into affiliate_click_daily:
// maps referer_path -> article_id; computes clicks and unique ip_hash counts.
import { eq, sql } from 'drizzle-orm';
import { bangkokDay } from '../affiliate/hash';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';

export interface ClickRollupOptions {
  /** Target days in YYYY-MM-DD (Bangkok). Defaults to yesterday. */
  targetDays?: string[];
  /** Reference timestamp in ms (defaults to Date.now()). Used when calculating yesterday. */
  nowMs?: number;
}

export interface DayRollupResult {
  day: string;
  totalClicks: number;
  uniqueClicks: number;
  groupsCount: number;
  rowsUpserted: number;
}

export interface ClickRollupResult {
  days: DayRollupResult[];
  totalRowsUpserted: number;
}

/**
 * Extracts the article slug from a referer path (e.g. `/articles/best-deals/` -> `best-deals`).
 * Returns null if the referer is not an article URL.
 */
export function extractArticleSlug(refererPath: string | null | undefined): string | null {
  if (!refererPath) return null;
  const clean = refererPath.split('?')[0]!.split('#')[0]!;
  const match = clean.match(/^\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return match ? match[1]! : null;
}

/**
 * Computes yesterday's calendar day in Bangkok (Asia/Bangkok, UTC+7).
 */
export function getBangkokYesterday(nowMs: number = Date.now()): string {
  const todayStr = bangkokDay(nowMs);
  const [y, m, d] = todayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Runs the affiliate click roll-up for the given target days (or yesterday if omitted).
 */
export async function runClickRollup(
  env: Env,
  options?: ClickRollupOptions,
): Promise<ClickRollupResult> {
  const db = getDb(env);
  const targetDays =
    options?.targetDays && options.targetDays.length > 0
      ? options.targetDays
      : [getBangkokYesterday(options?.nowMs)];

  // 1. Load article slug -> id mapping
  const articles = await db
    .select({
      id: schema.article.id,
      slug: schema.article.slug,
    })
    .from(schema.article);
  const slugToId = new Map(articles.map((a) => [a.slug, a.id]));

  const results: DayRollupResult[] = [];
  let totalRowsUpserted = 0;

  for (const day of targetDays) {
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;
    let totalClicks = 0;

    // Grouping map: key is `${linkId}\0${articleId}`
    const groups = new Map<
      string,
      { linkId: string; articleId: string; clicks: number; ipHashes: Set<string> }
    >();

    while (hasMore) {
      const clicks = await db
        .select({
          id: schema.affiliateClick.id,
          linkId: schema.affiliateClick.linkId,
          refererPath: schema.affiliateClick.refererPath,
          ipHash: schema.affiliateClick.ipHash,
        })
        .from(schema.affiliateClick)
        .where(eq(schema.affiliateClick.day, day))
        .limit(pageSize)
        .offset(offset);

      for (const c of clicks) {
        totalClicks++;
        const slug = extractArticleSlug(c.refererPath);
        const articleId = (slug ? slugToId.get(slug) : null) ?? '';
        const key = `${c.linkId}\0${articleId}`;

        let g = groups.get(key);
        if (!g) {
          g = { linkId: c.linkId, articleId, clicks: 0, ipHashes: new Set() };
          groups.set(key, g);
        }
        g.clicks++;
        g.ipHashes.add(c.ipHash);
      }

      if (clicks.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }

    let rowsUpserted = 0;
    let dayUniqueClicks = 0;

    if (groups.size > 0) {
      const rows = Array.from(groups.values()).map((g) => {
        const u = g.ipHashes.size;
        dayUniqueClicks += u;
        return {
          linkId: g.linkId,
          articleId: g.articleId,
          day,
          clicks: g.clicks,
          uniqueClicks: u,
        };
      });

      const chunkSize = 50;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await db
          .insert(schema.affiliateClickDaily)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              schema.affiliateClickDaily.linkId,
              schema.affiliateClickDaily.articleId,
              schema.affiliateClickDaily.day,
            ],
            set: {
              clicks: sql`excluded.clicks`,
              uniqueClicks: sql`excluded.unique_clicks`,
            },
          });
        rowsUpserted += chunk.length;
      }
    }

    totalRowsUpserted += rowsUpserted;
    results.push({
      day,
      totalClicks,
      uniqueClicks: dayUniqueClicks,
      groupsCount: groups.size,
      rowsUpserted,
    });

    console.log(
      `[jobs] affiliate-click-rollup: day ${day} processed ${totalClicks} clicks across ${groups.size} groups (${rowsUpserted} rows upserted)`,
    );
  }

  return {
    days: results,
    totalRowsUpserted,
  };
}

/**
 * Standard cron entrypoint matching CONTRACTS §1a.
 */
export async function run(env: Env): Promise<void> {
  await runClickRollup(env);
}
