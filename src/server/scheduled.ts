import type { Env } from './env';
import { run as runAffiliateJobs } from './jobs/affiliate-jobs';
import { run as publishScheduled } from './jobs/publish-scheduled';
import { run as syncStats } from './jobs/sync-stats';

/**
 * Daily cron handler (15 0 * * *).
 * Runs stats sync followed by affiliate upkeep jobs, each isolated from failures.
 */
export async function runDailyCron(env: Env): Promise<void> {
  // 1. Daily traffic stats sync from Cloudflare Web Analytics
  try {
    await syncStats(env);
  } catch (err) {
    console.error('[scheduled] syncStats failed:', err);
  }

  // 2. Daily affiliate jobs: roll-up, purge, link-check, expiry-alert
  try {
    await runAffiliateJobs(env);
  } catch (err) {
    console.error('[scheduled] runAffiliateJobs failed:', err);
  }
}

/** Cron strings from `wrangler.jsonc` (CONTRACTS §2) mapped to their jobs. */
export const CRON_JOBS: Record<string, (env: Env) => Promise<void>> = {
  '*/5 * * * *': publishScheduled,
  '15 0 * * *': runDailyCron,
};

export async function handleScheduled(cron: string, env: Env): Promise<void> {
  const job = CRON_JOBS[cron];
  if (!job) {
    console.warn(`[scheduled] no job for cron "${cron}"`);
    return;
  }
  await job(env);
}
