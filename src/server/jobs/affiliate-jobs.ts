// Affiliate daily jobs orchestrator (CONTRACTS §1a, §3, AFFILIATE §8, T24).
// Coordinates click-rollup, click-purge, link-check, and expiry-alert.
// Each job runs in isolation so one failure never stops the others.
import type { Env } from '../env';
import {
  runClickRollup,
  type ClickRollupOptions,
  type ClickRollupResult,
} from './affiliate-click-rollup';
import {
  runClickPurge,
  type ClickPurgeOptions,
  type ClickPurgeResult,
} from './affiliate-click-purge';
import { runLinkCheck, type LinkCheckOptions, type LinkCheckResult } from './affiliate-link-check';
import {
  runExpiryAlert,
  type ExpiryAlertOptions,
  type ExpiryAlertResult,
} from './affiliate-expiry-alert';

export interface AffiliateJobsOptions {
  rollup?: ClickRollupOptions;
  purge?: ClickPurgeOptions;
  linkCheck?: LinkCheckOptions;
  expiryAlert?: ExpiryAlertOptions;
}

export interface JobExecution<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AffiliateJobsSummary {
  rollup: JobExecution<ClickRollupResult>;
  purge: JobExecution<ClickPurgeResult>;
  linkCheck: JobExecution<LinkCheckResult>;
  expiryAlert: JobExecution<ExpiryAlertResult>;
}

/**
 * Runs all affiliate daily upkeep jobs with complete error isolation between jobs.
 */
export async function runAffiliateJobs(
  env: Env,
  options?: AffiliateJobsOptions,
): Promise<AffiliateJobsSummary> {
  // 1. Click Roll-up
  let rollup: JobExecution<ClickRollupResult>;
  try {
    const data = await runClickRollup(env, options?.rollup);
    rollup = { success: true, data };
  } catch (err) {
    console.error('[jobs] affiliate-click-rollup error:', err);
    rollup = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Click Purge
  let purge: JobExecution<ClickPurgeResult>;
  try {
    const data = await runClickPurge(env, options?.purge);
    purge = { success: true, data };
  } catch (err) {
    console.error('[jobs] affiliate-click-purge error:', err);
    purge = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 3. Link Check
  let linkCheck: JobExecution<LinkCheckResult>;
  try {
    const data = await runLinkCheck(env, options?.linkCheck);
    linkCheck = { success: true, data };
  } catch (err) {
    console.error('[jobs] affiliate-link-check error:', err);
    linkCheck = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 4. Expiry Alert
  let expiryAlert: JobExecution<ExpiryAlertResult>;
  try {
    const data = await runExpiryAlert(env, options?.expiryAlert);
    expiryAlert = { success: true, data };
  } catch (err) {
    console.error('[jobs] affiliate-expiry-alert error:', err);
    expiryAlert = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  return {
    rollup,
    purge,
    linkCheck,
    expiryAlert,
  };
}

/**
 * Standard cron entrypoint matching CONTRACTS §1a.
 */
export async function run(env: Env): Promise<void> {
  await runAffiliateJobs(env);
}
