// Daily affiliate click purge job (CONTRACTS §1a, §3, AFFILIATE §4, §8, D23).
// Deletes raw affiliate_click rows older than 90 days in batches to stay within D1 limits.
import { inArray, lt } from 'drizzle-orm';
import { bangkokDay } from '../affiliate/hash';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';

export interface ClickPurgeOptions {
  /** Explicit cutoff day (YYYY-MM-DD). If omitted, calculated from retentionDays. */
  cutoffDay?: string;
  /** Retention days (defaults to 90). */
  retentionDays?: number;
  /** Batch size per delete statement (defaults to 500). */
  batchSize?: number;
  /** Maximum number of batches to run in one invocation (defaults to 50). */
  maxBatches?: number;
  /** Reference timestamp in ms (defaults to Date.now()). */
  nowMs?: number;
}

export interface ClickPurgeResult {
  cutoffDay: string;
  totalDeleted: number;
  batchesRun: number;
}

/**
 * Computes the cutoff calendar day in Bangkok (Asia/Bangkok, UTC+7).
 * Clicks with `day < cutoffDay` are strictly older than `retentionDays`.
 */
export function getBangkokCutoffDay(
  retentionDays: number = 90,
  nowMs: number = Date.now(),
): string {
  const todayStr = bangkokDay(nowMs);
  const [y, m, d] = todayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() - retentionDays);
  return date.toISOString().slice(0, 10);
}

/**
 * Runs the affiliate click purge job, removing rows older than 90 days in batches.
 */
export async function runClickPurge(
  env: Env,
  options?: ClickPurgeOptions,
): Promise<ClickPurgeResult> {
  const db = getDb(env);
  const cutoffDay =
    options?.cutoffDay ?? getBangkokCutoffDay(options?.retentionDays ?? 90, options?.nowMs);

  const batchSize = options?.batchSize ?? 500;
  const maxBatches = options?.maxBatches ?? 50;

  let totalDeleted = 0;
  let batchesRun = 0;

  while (batchesRun < maxBatches) {
    const rows = await db
      .select({ id: schema.affiliateClick.id })
      .from(schema.affiliateClick)
      .where(lt(schema.affiliateClick.day, cutoffDay))
      .limit(batchSize);

    if (rows.length === 0) {
      break;
    }

    const ids = rows.map((r) => r.id);
    await db.delete(schema.affiliateClick).where(inArray(schema.affiliateClick.id, ids));

    totalDeleted += ids.length;
    batchesRun++;

    if (rows.length < batchSize) {
      break;
    }
  }

  console.log(
    `[jobs] affiliate-click-purge: purged ${totalDeleted} clicks older than ${cutoffDay} in ${batchesRun} batches`,
  );

  return {
    cutoffDay,
    totalDeleted,
    batchesRun,
  };
}

/**
 * Standard cron entrypoint matching CONTRACTS §1a.
 */
export async function run(env: Env): Promise<void> {
  await runClickPurge(env);
}
