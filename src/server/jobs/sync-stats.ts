// Daily traffic stats sync from Cloudflare Web Analytics (CONTRACTS §1a, §2, S5, D11).
// Queries rumPageloadEventsAdaptiveGroups via GraphQL for yesterday and backfills missing days.
import { gte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';
import { getSiteSettings } from '../db/site-settings';

export const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

export const RUM_QUERY = `
query (
  $acc: String!
  $tag: String!
  $s: Time!
  $e: Time!
  $limit: Int
  $offset: Int
) {
  viewer {
    accounts(filter: { accountTag: $acc }) {
      rumPageloadEventsAdaptiveGroups(
        limit: $limit
        offset: $offset
        orderBy: [count_DESC]
        filter: { siteTag: $tag, bot: 0, datetime_geq: $s, datetime_leq: $e }
      ) {
        count
        sum {
          visits
        }
        avg {
          sampleInterval
        }
        dimensions {
          requestHost
          requestPath
        }
      }
    }
  }
}
`;

export interface RumAdaptiveGroup {
  count: number;
  sum?: { visits?: number | null } | null;
  avg?: { sampleInterval?: number | null } | null;
  dimensions?: {
    requestHost?: string | null;
    requestPath?: string | null;
  } | null;
}

export interface GraphQlResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        rumPageloadEventsAdaptiveGroups?: RumAdaptiveGroup[];
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

export interface SyncStatsOptions {
  /** Target dates in YYYY-MM-DD format. If omitted, syncs yesterday + backfills missing days. */
  targetDays?: string[];
  /** Maximum number of days to look back for missing days (default 30). */
  maxBackfillDays?: number;
  /** Maximum days to sync in one run to stay within subrequest limits (default 30). */
  maxDaysPerRun?: number;
  /** Page size for GraphQL pagination (default 1000). */
  pageSize?: number;
  /** Reference timestamp for calculating yesterday (defaults to now). */
  now?: Date;
  /** Custom fetch implementation (useful for unit tests). */
  fetchFn?: typeof fetch;
  /** Whether to rethrow GraphQL / network errors. */
  throwOnError?: boolean;
}

export interface SyncStatsResult {
  syncedDays: string[];
  totalRowsUpserted: number;
  skipped: boolean;
  reason?: string;
}

/** Formats a date into UTC YYYY-MM-DD. */
export function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Returns the date N days before the given date in UTC. */
export function getDaysAgoUtc(ref: Date, days: number): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - days));
}

/** Returns yesterday in UTC as a YYYY-MM-DD string. */
export function getYesterdayUtc(ref: Date = new Date()): string {
  return formatUtcDay(getDaysAgoUtc(ref, 1));
}

/** Fetches one page of RUM adaptive groups from Cloudflare GraphQL API. */
export async function fetchRumPage(
  env: Env,
  params: {
    startIso: string;
    endIso: string;
    limit: number;
    offset: number;
    fetchFn?: typeof fetch;
  },
): Promise<RumAdaptiveGroup[]> {
  const fetcher = params.fetchFn ?? fetch;

  const res = await fetcher(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: RUM_QUERY,
      variables: {
        acc: env.CF_ACCOUNT_ID,
        tag: env.CF_WEB_ANALYTICS_SITE_TAG,
        s: params.startIso,
        e: params.endIso,
        limit: params.limit,
        offset: params.offset,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare GraphQL HTTP error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as GraphQlResponse;
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Cloudflare GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
  }

  const accounts = json.data?.viewer?.accounts;
  if (!accounts || accounts.length === 0) {
    return [];
  }

  return accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];
}

/**
 * Worker-internal execution function returning detailed sync results.
 */
export async function syncStats(env: Env, options?: SyncStatsOptions): Promise<SyncStatsResult> {
  const accountId = env.CF_ACCOUNT_ID?.trim();
  const siteTag = env.CF_WEB_ANALYTICS_SITE_TAG?.trim();
  const apiToken = env.CF_ANALYTICS_API_TOKEN?.trim();

  if (!accountId || !siteTag || !apiToken) {
    console.log(
      '[jobs] sync-stats ran: skipped (CF_ACCOUNT_ID, CF_WEB_ANALYTICS_SITE_TAG, or CF_ANALYTICS_API_TOKEN unconfigured)',
    );
    return {
      syncedDays: [],
      totalRowsUpserted: 0,
      skipped: true,
      reason: 'unconfigured',
    };
  }

  let targetHost = '';
  try {
    const settings = await getSiteSettings(env);
    targetHost = settings?.site_url ? new URL(settings.site_url).host.toLowerCase() : '';
  } catch {
    targetHost = '';
  }

  const db = getDb(env);
  const now = options?.now ?? new Date();
  const yesterday = getYesterdayUtc(now);

  let daysToSync: string[] = [];

  if (options?.targetDays && options.targetDays.length > 0) {
    daysToSync = [...options.targetDays];
  } else {
    const maxBackfillDays = options?.maxBackfillDays ?? 30;
    const earliestDate = getDaysAgoUtc(new Date(`${yesterday}T00:00:00.000Z`), maxBackfillDays - 1);
    const earliestDay = formatUtcDay(earliestDate);

    // Identify which days already exist in D1
    const existingRows = await db
      .selectDistinct({ day: schema.pageStatDaily.day })
      .from(schema.pageStatDaily)
      .where(gte(schema.pageStatDaily.day, earliestDay));

    const existingDaysSet = new Set(existingRows.map((r) => r.day));

    // Collect missing days in chronological order
    const missingDays: string[] = [];
    let curDate = earliestDate;
    const yesterdayDate = new Date(`${yesterday}T00:00:00.000Z`);

    while (curDate <= yesterdayDate) {
      const d = formatUtcDay(curDate);
      // Yesterday is always re-synced to catch final late arriving events
      if (!existingDaysSet.has(d) || d === yesterday) {
        missingDays.push(d);
      }
      curDate = new Date(
        Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth(), curDate.getUTCDate() + 1),
      );
    }

    const maxDaysPerRun = options?.maxDaysPerRun ?? 30;
    daysToSync = missingDays.slice(-maxDaysPerRun);
  }

  const pageSize = options?.pageSize ?? 1000;
  let totalRowsUpserted = 0;
  const syncedDays: string[] = [];

  for (const day of daysToSync) {
    const startIso = `${day}T00:00:00.000Z`;
    const endIso = `${day}T23:59:59.999Z`;

    let offset = 0;
    let hasMore = true;
    const pathStats = new Map<string, { views: number; visits: number }>();

    try {
      while (hasMore) {
        const groups = await fetchRumPage(env, {
          startIso,
          endIso,
          limit: pageSize,
          offset,
          fetchFn: options?.fetchFn,
        });

        for (const group of groups) {
          const host = group.dimensions?.requestHost?.toLowerCase();
          // Filter to the site's host (or match if targetHost matches)
          if (targetHost && host && host !== targetHost) {
            continue;
          }

          const rawPath = group.dimensions?.requestPath;
          if (!rawPath) continue;
          let normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
          const withoutQuery = normalized.split('?')[0] ?? normalized;
          const cleanPath = withoutQuery.split('#')[0] ?? withoutQuery;

          // S5 sampling: weight count and visits by sampleInterval
          const sampleInterval = group.avg?.sampleInterval ?? 1;
          const views = Math.round(group.count * sampleInterval);
          const visits = Math.round((group.sum?.visits ?? 0) * sampleInterval);

          const existing = pathStats.get(cleanPath);
          if (existing) {
            existing.views += views;
            existing.visits += visits;
          } else {
            pathStats.set(cleanPath, { views, visits });
          }
        }

        if (groups.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      }

      // Upsert into page_stat_daily for this day: D1 writes per day <= distinct paths
      if (pathStats.size > 0) {
        const entries = Array.from(pathStats.entries()).map(([path, stat]) => ({
          path,
          day,
          views: stat.views,
          visits: stat.visits,
        }));

        // Batch in chunks of 50 to respect SQLite limits
        const chunkSize = 50;
        for (let i = 0; i < entries.length; i += chunkSize) {
          const chunk = entries.slice(i, i + chunkSize);
          await db
            .insert(schema.pageStatDaily)
            .values(chunk)
            .onConflictDoUpdate({
              target: [schema.pageStatDaily.path, schema.pageStatDaily.day],
              set: {
                views: sql`excluded.views`,
                visits: sql`excluded.visits`,
              },
            });
        }
        totalRowsUpserted += entries.length;
      }

      syncedDays.push(day);
    } catch (err) {
      console.error(`[jobs] sync-stats error for ${day}:`, err);
      if (options?.throwOnError) {
        throw err;
      }
    }
  }

  console.log(
    `[jobs] sync-stats ran: synced ${syncedDays.length} days (${syncedDays.join(', ')}), ${totalRowsUpserted} rows upserted`,
  );

  return {
    syncedDays,
    totalRowsUpserted,
    skipped: false,
  };
}

/**
 * Standard cron entrypoint matching CONTRACTS §1a: `export async function run(env: Env): Promise<void>`.
 */
export async function run(env: Env, options?: SyncStatsOptions): Promise<void> {
  await syncStats(env, options);
}
