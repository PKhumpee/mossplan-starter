// Daily affiliate expiry alert job (CONTRACTS §1a, §3, AFFILIATE §6, §8).
// Identifies active links that are past expires_at or expiring within 14 days.
// Prepares alert data for the dashboard card and logs warnings.
// Optional email alerts via Resend are off by default.
import { and, eq, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';

export interface ExpiryAlertOptions {
  /** Reference timestamp in ms (defaults to Date.now()). */
  nowMs?: number;
  /** Days ahead to consider expiring soon (defaults to 14 days). */
  daysAhead?: number;
  /** Optional flag to trigger email dispatch if configured (off by default). */
  sendEmail?: boolean;
}

export interface ExpiryLinkItem {
  id: string;
  slug: string;
  label: string;
  merchantId: string;
  merchantName: string;
  status: string;
  expiresAt: number;
  daysRemaining: number;
}

export interface ExpiryAlertResult {
  checkedAt: number;
  expiringCount: number;
  expiredCount: number;
  expiringLinks: ExpiryLinkItem[];
  expiredLinks: ExpiryLinkItem[];
  emailSent?: boolean;
}

/**
 * Runs the expiry alert check for active affiliate links.
 */
export async function runExpiryAlert(
  env: Env,
  options?: ExpiryAlertOptions,
): Promise<ExpiryAlertResult> {
  const db = getDb(env);
  const now = options?.nowMs ?? Date.now();
  const daysAhead = options?.daysAhead ?? 14;
  const threshold = now + daysAhead * 86400_000;

  // Query active links that have an expiresAt timestamp on or before threshold
  const candidates = await db
    .select({
      id: schema.affiliateLink.id,
      slug: schema.affiliateLink.slug,
      label: schema.affiliateLink.label,
      merchantId: schema.affiliateLink.merchantId,
      status: schema.affiliateLink.status,
      expiresAt: schema.affiliateLink.expiresAt,
      merchantName: schema.merchant.name,
    })
    .from(schema.affiliateLink)
    .innerJoin(schema.merchant, eq(schema.affiliateLink.merchantId, schema.merchant.id))
    .where(
      and(
        eq(schema.affiliateLink.status, 'active'),
        sql`${schema.affiliateLink.expiresAt} IS NOT NULL`,
        lte(schema.affiliateLink.expiresAt, threshold),
      ),
    )
    .orderBy(schema.affiliateLink.expiresAt);

  const expiringLinks: ExpiryLinkItem[] = [];
  const expiredLinks: ExpiryLinkItem[] = [];

  for (const c of candidates) {
    if (!c.expiresAt) continue;
    const diffMs = c.expiresAt - now;
    const daysRemaining = Math.ceil(diffMs / 86400_000);

    const item: ExpiryLinkItem = {
      id: c.id,
      slug: c.slug,
      label: c.label,
      merchantId: c.merchantId,
      merchantName: c.merchantName,
      status: c.status,
      expiresAt: c.expiresAt,
      daysRemaining,
    };

    if (c.expiresAt <= now) {
      expiredLinks.push(item);
    } else {
      expiringLinks.push(item);
    }
  }

  console.log(
    `[jobs] affiliate-expiry-alert: checked at ${new Date(now).toISOString()}: ` +
      `${expiredLinks.length} expired, ${expiringLinks.length} expiring within ${daysAhead} days`,
  );

  return {
    checkedAt: now,
    expiringCount: expiringLinks.length,
    expiredCount: expiredLinks.length,
    expiringLinks,
    expiredLinks,
    emailSent: false,
  };
}

/**
 * Standard cron entrypoint matching CONTRACTS §1a.
 */
export async function run(env: Env): Promise<void> {
  await runExpiryAlert(env);
}
