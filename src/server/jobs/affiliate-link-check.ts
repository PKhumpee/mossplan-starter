// Daily affiliate link health check job (CONTRACTS §1a, §3, AFFILIATE §4, §6, §8, S6).
// For each active link not checked in 24h, follows redirects manually (up to 5 hops).
// Marks 'broken' after 2 consecutive failures (4xx/5xx/timeout) or immediately if final host
// is outside the merchant's domain. Rotates in batches to stay within S6 subrequest limits.
import { and, eq, lte, or, sql } from 'drizzle-orm';
import { recordAudit } from '../db/audit';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';
import {
  getEffectiveBlockedDomains,
  isHostMatchingDomain,
  parseTrackingHosts,
  validateDestinationUrl,
} from '../routes/affiliate';

export interface LinkCheckOptions {
  /** Maximum number of links to check in one run (defaults to 8, per S6 subrequest limit). */
  batchSize?: number;
  /** Maximum redirect hops to follow per link (defaults to 5). */
  maxHops?: number;
  /** Timeout in ms per hop (defaults to 5000). */
  timeoutMs?: number;
  /** Custom fetch function (for mocking in tests). */
  fetchFn?: typeof fetch;
  /** Reference timestamp in ms (defaults to Date.now()). */
  nowMs?: number;
  /** Custom blocked domains list. */
  blockedDomains?: string[];
}

export interface LinkCheckItemResult {
  linkId: string;
  slug: string;
  previousStatus: string;
  previousCheckStatus: string | null;
  newStatus: 'active' | 'broken';
  checkStatus: string;
  hopsCount: number;
  reason?: string;
}

export interface LinkCheckResult {
  checkedCount: number;
  brokenCount: number;
  activeCount: number;
  results: LinkCheckItemResult[];
}

/**
 * Determines whether a check status string represents a failure (4xx, 5xx, or error code).
 */
export function isFailureStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const num = Number(status);
  if (!isNaN(num)) {
    return num < 200 || num >= 400;
  }
  // Error strings like 'TIMEOUT', 'FETCH_ERROR', 'URL_INVALID', 'DOMAIN_MISMATCH', etc.
  return true;
}

export interface HopInfo {
  url: string;
  status: number;
  location?: string;
}

/**
 * Follows manual redirects for a destination URL and verifies domain constraints.
 */
export async function verifyLinkRedirects(
  pastedUrl: string,
  merchant: { domain: string; trackingHostsJson: string },
  options: {
    maxHops?: number;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
    blockedDomains?: string[];
  },
): Promise<
  | { success: true; hops: HopInfo[]; finalUrl: string; finalHost: string; status: number }
  | {
      success: false;
      error:
        | 'DOMAIN_MISMATCH'
        | 'DOMAIN_BLOCKED'
        | 'URL_INVALID'
        | 'TIMEOUT'
        | 'FETCH_ERROR'
        | 'TOO_MANY_REDIRECTS';
      message: string;
      hops: HopInfo[];
      status?: number;
    }
> {
  const maxHops = options.maxHops ?? 5;
  const timeoutMs = options.timeoutMs ?? 5000;
  const fetcher = options.fetchFn ?? fetch;
  const blocked = options.blockedDomains ?? getEffectiveBlockedDomains();

  // 1. Initial URL validation
  const initial = validateDestinationUrl(pastedUrl, blocked);
  if (!initial.valid) {
    return {
      success: false,
      error: initial.error.code,
      message: initial.error.message,
      hops: [],
    };
  }

  // 2. Validate starting host against merchant domain or tracking hosts (AFFILIATE §4)
  const pastedHost = initial.url.hostname.toLowerCase();
  const trackingHosts = parseTrackingHosts(merchant.trackingHostsJson);
  const startingHostValid =
    isHostMatchingDomain(pastedHost, merchant.domain) ||
    trackingHosts.some((th) => isHostMatchingDomain(pastedHost, th));

  if (!startingHostValid) {
    return {
      success: false,
      error: 'DOMAIN_MISMATCH',
      message: `Starting host ${pastedHost} does not match merchant domain ${merchant.domain} or tracking hosts`,
      hops: [],
    };
  }

  let currentUrl = pastedUrl;
  const hops: HopInfo[] = [];
  let hopCount = 0;

  while (true) {
    const hopCheck = validateDestinationUrl(currentUrl, blocked);
    if (!hopCheck.valid) {
      return {
        success: false,
        error: hopCheck.error.code,
        message: hopCheck.error.message,
        hops,
      };
    }

    let res: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        res = await fetcher(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err: unknown) {
      const isTimeout =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.message.toLowerCase().includes('timeout'));
      if (isTimeout) {
        return {
          success: false,
          error: 'TIMEOUT',
          message: 'Request timed out',
          hops,
        };
      }
      return {
        success: false,
        error: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Network error',
        hops,
      };
    }

    // Cancel response body immediately to avoid consuming CPU/memory
    try {
      if (res.body) {
        await res.body.cancel();
      }
    } catch {
      // ignore cancel error
    }

    // Handle redirects (301, 302, 303, 307, 308)
    if (res.status >= 300 && res.status < 400) {
      hopCount++;
      if (hopCount > maxHops) {
        return {
          success: false,
          error: 'TOO_MANY_REDIRECTS',
          message: `Too many redirects (exceeded ${maxHops} hops)`,
          hops,
          status: res.status,
        };
      }

      const location = res.headers.get('location');
      if (!location) {
        hops.push({ url: currentUrl, status: res.status });
        break;
      }

      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        return {
          success: false,
          error: 'URL_INVALID',
          message: 'Invalid location header in redirect',
          hops,
          status: res.status,
        };
      }

      hops.push({ url: currentUrl, status: res.status, location: nextUrl });
      currentUrl = nextUrl;
      continue;
    }

    // Non-redirect response
    hops.push({ url: currentUrl, status: res.status });
    break;
  }

  const finalUrl = currentUrl;
  const finalHost = new URL(finalUrl).hostname.toLowerCase();
  const lastHop = hops[hops.length - 1];
  const finalStatus = lastHop?.status ?? 200;

  // 3. Final landing host check: must match merchant domain (or subdomain)
  if (!isHostMatchingDomain(finalHost, merchant.domain)) {
    return {
      success: false,
      error: 'DOMAIN_MISMATCH',
      message: `Final host ${finalHost} does not match merchant domain ${merchant.domain}`,
      hops,
      status: finalStatus,
    };
  }

  // 4. HTTP status check: 4xx or 5xx is an HTTP failure
  if (finalStatus < 200 || finalStatus >= 400) {
    return {
      success: false,
      error: 'FETCH_ERROR',
      message: `Destination returned error status ${finalStatus}`,
      hops,
      status: finalStatus,
    };
  }

  return {
    success: true,
    hops,
    finalUrl,
    finalHost,
    status: finalStatus,
  };
}

/**
 * Runs the affiliate link health check job.
 * Selects up to `batchSize` active links not checked in 24h, rotating oldest first.
 */
export async function runLinkCheck(env: Env, options?: LinkCheckOptions): Promise<LinkCheckResult> {
  const db = getDb(env);
  const now = options?.nowMs ?? Date.now();
  const twentyFourHoursAgo = now - 24 * 3600_000;
  const batchSize = options?.batchSize ?? 8;

  // Query up to `batchSize` active links that have not been checked in the last 24h.
  // Order: links never checked first, then oldest checked first (rotation).
  const candidateLinks = await db
    .select({
      id: schema.affiliateLink.id,
      slug: schema.affiliateLink.slug,
      merchantId: schema.affiliateLink.merchantId,
      destinationUrl: schema.affiliateLink.destinationUrl,
      status: schema.affiliateLink.status,
      lastCheckedAt: schema.affiliateLink.lastCheckedAt,
      lastCheckStatus: schema.affiliateLink.lastCheckStatus,
      lastCheckHops: schema.affiliateLink.lastCheckHops,
      merchantDomain: schema.merchant.domain,
      merchantTrackingHostsJson: schema.merchant.trackingHostsJson,
    })
    .from(schema.affiliateLink)
    .innerJoin(schema.merchant, eq(schema.affiliateLink.merchantId, schema.merchant.id))
    .where(
      and(
        eq(schema.affiliateLink.status, 'active'),
        or(
          sql`${schema.affiliateLink.lastCheckedAt} IS NULL`,
          lte(schema.affiliateLink.lastCheckedAt, twentyFourHoursAgo),
        ),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${schema.affiliateLink.lastCheckedAt} IS NULL THEN 0 ELSE 1 END`,
      schema.affiliateLink.lastCheckedAt,
      schema.affiliateLink.id,
    )
    .limit(batchSize);

  const results: LinkCheckItemResult[] = [];
  let brokenCount = 0;
  let activeCount = 0;

  for (const link of candidateLinks) {
    const verifyRes = await verifyLinkRedirects(
      link.destinationUrl,
      {
        domain: link.merchantDomain,
        trackingHostsJson: link.merchantTrackingHostsJson,
      },
      {
        maxHops: options?.maxHops,
        timeoutMs: options?.timeoutMs,
        fetchFn: options?.fetchFn,
        blockedDomains: options?.blockedDomains,
      },
    );

    const hopsCount = verifyRes.hops.length;
    let newStatus: 'active' | 'broken' = 'active';
    let checkStatus: string;
    let failureReason: string | undefined;

    if (verifyRes.success) {
      checkStatus = String(verifyRes.status);
      newStatus = 'active';
    } else {
      // Determine error check status code or HTTP status
      checkStatus =
        verifyRes.status && (verifyRes.status < 200 || verifyRes.status >= 400)
          ? String(verifyRes.status)
          : verifyRes.error;
      failureReason = verifyRes.message;

      // Status transition rule (AFFILIATE §8):
      // 1. If final host outside merchant domain (DOMAIN_MISMATCH) or DOMAIN_BLOCKED:
      //    mark 'broken' immediately.
      // 2. For 4xx/5xx/timeout/fetch error:
      //    mark 'broken' after 2 consecutive failures.
      if (verifyRes.error === 'DOMAIN_MISMATCH' || verifyRes.error === 'DOMAIN_BLOCKED') {
        newStatus = 'broken';
      } else {
        const wasPreviouslyFailing = isFailureStatus(link.lastCheckStatus);
        if (wasPreviouslyFailing) {
          // Second consecutive failure!
          newStatus = 'broken';
        } else {
          // First failure: stay active, record failing check status
          newStatus = 'active';
        }
      }
    }

    if (newStatus === 'broken') {
      brokenCount++;
    } else {
      activeCount++;
    }

    // Update affiliate_link record in D1
    await db
      .update(schema.affiliateLink)
      .set({
        status: newStatus,
        lastCheckedAt: now,
        lastCheckStatus: checkStatus,
        lastCheckHops: hopsCount,
        updatedAt: now,
      })
      .where(eq(schema.affiliateLink.id, link.id));

    // If transitioned to broken, log audit trail
    if (newStatus === 'broken') {
      await recordAudit(db, {
        actorId: null,
        action: 'affiliate.link_broken',
        targetType: 'affiliate_link',
        targetId: link.id,
        meta: {
          slug: link.slug,
          previousCheckStatus: link.lastCheckStatus,
          currentCheckStatus: checkStatus,
          hopsCount,
          reason: failureReason,
        },
      });
    }

    results.push({
      linkId: link.id,
      slug: link.slug,
      previousStatus: link.status,
      previousCheckStatus: link.lastCheckStatus,
      newStatus,
      checkStatus,
      hopsCount,
      reason: failureReason,
    });
  }

  console.log(
    `[jobs] affiliate-link-check: checked ${candidateLinks.length} links (${activeCount} active, ${brokenCount} marked broken)`,
  );

  return {
    checkedCount: candidateLinks.length,
    brokenCount,
    activeCount,
    results,
  };
}

/**
 * Standard cron entrypoint matching CONTRACTS §1a.
 */
export async function run(env: Env): Promise<void> {
  await runLinkCheck(env);
}
