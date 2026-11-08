// Affiliate admin routes (CONTRACTS §5, AFFILIATE §6, D21–D24, D35).
// Endpoints for merchants, links, URL resolve, CSV conversion import, and reports.
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import policyConfig from '../../../config/content-policy.json';
import { bangkokDay } from '../affiliate/hash';
import { requireRole, requireSession } from '../auth/guard';
import { getDb } from '../db/client';
import { recordAudit } from '../db/audit';
import * as schema from '../db/schema';
import { fail, ok } from '../http/respond';
import type { AppEnv, SessionUser } from '../http/types';
import { paginationSchema, parseBody, parseParams, parseQuery } from '../http/validate';

// ---------------------------------------------------------------- Constants & Validation

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let customBlockedDomains: string[] | null = null;

export function setCustomBlockedDomains(domains: string[] | null): void {
  customBlockedDomains = domains;
}

export function getEffectiveBlockedDomains(): string[] {
  return customBlockedDomains ?? policyConfig.blockedDomains ?? [];
}

export interface ResolvedHop {
  url: string;
  status: number;
  location?: string;
}

export interface ResolveResult {
  hops: ResolvedHop[];
  finalUrl: string;
  finalHost: string;
  merchant: {
    id: string;
    name: string;
    domain: string;
    trackingHosts: string[];
  } | null;
  suggestedSlug: string;
  suggestedLabel: string;
  problems: string[];
}

export interface ResolveError {
  code: 'URL_INVALID' | 'DOMAIN_BLOCKED' | 'DOMAIN_MISMATCH';
  message: string;
}

// ---------------------------------------------------------------- Helpers: Domains & URLs

/** Checks if a hostname is an IPv4 or IPv6 address. */
export function isIpHost(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '');
  // IPv4 format check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clean)) {
    const parts = clean.split('.').map(Number);
    return parts.every((p) => p >= 0 && p <= 255);
  }
  // IPv6 format check (contains colon)
  if (clean.includes(':')) {
    return true;
  }
  return false;
}

/** Checks whether a hostname matches any domain in blockedDomains (exact or subdomain). */
export function isDomainBlocked(host: string, blockedDomains: string[]): boolean {
  if (!blockedDomains || blockedDomains.length === 0) return false;
  const h = host.toLowerCase().trim();
  for (const b of blockedDomains) {
    const cleanB = b.toLowerCase().trim();
    if (cleanB && (h === cleanB || h.endsWith('.' + cleanB))) {
      return true;
    }
  }
  return false;
}

/** Checks if a host matches a domain (exact or subdomain). */
export function isHostMatchingDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().trim();
  const d = domain.toLowerCase().trim();
  return h === d || h.endsWith('.' + d);
}

/** Parses tracking hosts JSON safely. */
export function parseTrackingHosts(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map((s) => String(s).toLowerCase().trim()) : [];
  } catch {
    return [];
  }
}

/** Decodes basic HTML entities found in titles. */
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Validates destination URL rules (AFFILIATE §6):
 * https only; no IP-address hosts, no credentials, port 443 only; length <= 2000;
 * not in blockedDomains.
 */
export function validateDestinationUrl(
  urlStr: string,
  blockedDomains: string[],
): { valid: true; url: URL } | { valid: false; error: ResolveError } {
  if (!urlStr || typeof urlStr !== 'string') {
    return {
      valid: false,
      error: { code: 'URL_INVALID', message: 'กรุณาระบุ URL ที่ต้องการตรวจสอบ' },
    };
  }

  if (urlStr.length > 2000) {
    return {
      valid: false,
      error: { code: 'URL_INVALID', message: 'ความยาว URL ต้องไม่เกิน 2,000 ตัวอักษร' },
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, error: { code: 'URL_INVALID', message: 'รูปแบบ URL ไม่ถูกต้อง' } };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: { code: 'URL_INVALID', message: 'URL ต้องใช้โปรโตคอล https เท่านั้น' },
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: { code: 'URL_INVALID', message: 'URL ต้องไม่มีข้อมูลประจำตัว (credentials)' },
    };
  }

  if (parsed.port && parsed.port !== '443') {
    return {
      valid: false,
      error: { code: 'URL_INVALID', message: 'URL ต้องไม่ระบุพอร์ตอื่นนอกจาก 443' },
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isIpHost(hostname)) {
    return {
      valid: false,
      error: { code: 'URL_INVALID', message: 'URL ต้องไม่ใช้ IP address เป็นโฮสต์' },
    };
  }

  if (isDomainBlocked(hostname, blockedDomains)) {
    return {
      valid: false,
      error: {
        code: 'DOMAIN_BLOCKED',
        message: `โดเมน ${hostname} อยู่ในรายการโดเมนที่ถูกบล็อกตามนโยบายเว็บไซต์`,
      },
    };
  }

  return { valid: true, url: parsed };
}

/** Reads up to 64 KB of response body and decodes as text. */
async function readBodyUpTo64KB(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const maxBytes = 64 * 1024;

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore reader cancel errors
    }
  }

  const merged = new Uint8Array(Math.min(totalBytes, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const toCopy = Math.min(chunk.byteLength, merged.byteLength - offset);
    merged.set(chunk.subarray(0, toCopy), offset);
    offset += toCopy;
    if (offset >= merged.byteLength) break;
  }
  return new TextDecoder().decode(merged);
}

/** Generates a suggested slug from merchant and label. */
export function generateSuggestedSlug(merchantNameOrDomain: string, label: string): string {
  const cleanLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cleanMerchant = merchantNameOrDomain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let base = '';
  if (cleanMerchant && cleanLabel) {
    base = `${cleanMerchant}-${cleanLabel}`;
  } else if (cleanMerchant) {
    base = `${cleanMerchant}-deal`;
  } else if (cleanLabel) {
    base = cleanLabel;
  } else {
    base = 'aff-link';
  }

  base = base.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (base.length > 50) base = base.slice(0, 50).replace(/-+$/, '');
  return base || 'affiliate-deal';
}

/**
 * Follows up to 5 redirects manually and validates all rules along the chain (AFFILIATE §6).
 */
export async function resolveRedirects(
  pastedUrl: string,
  options: {
    db: ReturnType<typeof getDb>;
    blockedDomains?: string[];
    expectedMerchantId?: string;
    maxHops?: number;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  },
): Promise<{ ok: true; data: ResolveResult } | { ok: false; error: ResolveError }> {
  const blocked = options.blockedDomains ?? getEffectiveBlockedDomains();
  const maxHops = options.maxHops ?? 5;
  const timeoutMs = options.timeoutMs ?? 5000;
  const fetcher = options.fetchFn ?? fetch;

  // 1. Initial URL validation
  const initialCheck = validateDestinationUrl(pastedUrl, blocked);
  if (!initialCheck.valid) {
    return { ok: false, error: initialCheck.error };
  }

  let currentUrl = pastedUrl;
  const hops: ResolvedHop[] = [];
  let finalTitle = '';
  let hopCount = 0;

  // 2. Redirect following loop (manual redirect, <= 5 hops, 5s timeout per hop)
  while (true) {
    const hopCheck = validateDestinationUrl(currentUrl, blocked);
    if (!hopCheck.valid) {
      return { ok: false, error: hopCheck.error };
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
          ok: false,
          error: {
            code: 'URL_INVALID',
            message: 'หมดเวลาการเชื่อมต่อ (เกิน 5 วินาที)',
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'URL_INVALID',
          message: `ไม่สามารถเชื่อมต่อ URL ได้: ${err instanceof Error ? err.message : 'เครือข่ายขัดข้อง'}`,
        },
      };
    }

    // Check redirect status codes (301, 302, 303, 307, 308)
    if (res.status >= 300 && res.status < 400) {
      hopCount++;
      if (hopCount > maxHops) {
        return {
          ok: false,
          error: {
            code: 'URL_INVALID',
            message: 'การเปลี่ยนเส้นทางเกิน 5 ครั้ง (เกินขีดจำกัดความปลอดภัย)',
          },
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
          ok: false,
          error: {
            code: 'URL_INVALID',
            message: 'Location header ของการเปลี่ยนเส้นทางไม่ถูกต้อง',
          },
        };
      }

      hops.push({ url: currentUrl, status: res.status, location: nextUrl });
      currentUrl = nextUrl;
      continue;
    }

    // Non-redirect response
    hops.push({ url: currentUrl, status: res.status });
    if (res.status === 200) {
      try {
        const html = await readBodyUpTo64KB(res);
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (match && match[1]) {
          finalTitle = decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim());
        }
      } catch {
        // Ignore read errors
      }
    }
    break;
  }

  const finalUrl = currentUrl;
  const finalHost = new URL(finalUrl).hostname.toLowerCase();
  const pastedHost = new URL(pastedUrl).hostname.toLowerCase();

  // 3. Match merchant from database
  const merchants = await options.db.select().from(schema.merchant);

  const matchedByLanding = merchants.find((m) => isHostMatchingDomain(finalHost, m.domain));
  const matchedByPasted = merchants.find((m) => {
    if (isHostMatchingDomain(pastedHost, m.domain)) return true;
    const tracking = parseTrackingHosts(m.trackingHostsJson);
    return tracking.some((th) => isHostMatchingDomain(pastedHost, th));
  });

  // Verify against expectedMerchantId if provided
  if (options.expectedMerchantId) {
    const expected = merchants.find((m) => m.id === options.expectedMerchantId);
    if (!expected) {
      return {
        ok: false,
        error: { code: 'DOMAIN_MISMATCH', message: 'ไม่พบร้านค้าที่ระบุ' },
      };
    }

    // Check pasted host
    const tracking = parseTrackingHosts(expected.trackingHostsJson);
    const pastedMatches =
      isHostMatchingDomain(pastedHost, expected.domain) ||
      tracking.some((th) => isHostMatchingDomain(pastedHost, th));

    if (!pastedMatches) {
      return {
        ok: false,
        error: {
          code: 'DOMAIN_MISMATCH',
          message: `โฮสต์ของลิงก์ที่วาง (${pastedHost}) ไม่ตรงกับโดเมนหรือ tracking hosts ของร้านค้า (${expected.domain})`,
        },
      };
    }

    // Check final landing host
    if (!isHostMatchingDomain(finalHost, expected.domain)) {
      return {
        ok: false,
        error: {
          code: 'DOMAIN_MISMATCH',
          message: `โดเมนปลายทาง (${finalHost}) ไม่ตรงกับโดเมนของร้านค้า (${expected.domain})`,
        },
      };
    }
  } else {
    // If pasted host belonged to a merchant (e.g. tracking host) but final landing host does not match
    if (matchedByPasted) {
      if (!isHostMatchingDomain(finalHost, matchedByPasted.domain)) {
        return {
          ok: false,
          error: {
            code: 'DOMAIN_MISMATCH',
            message: `ลิงก์ของร้านค้า ${matchedByPasted.name} เปลี่ยนเส้นทางไปยังโดเมน ${finalHost} ซึ่งไม่ตรงกับโดเมนร้านค้า (${matchedByPasted.domain})`,
          },
        };
      }
    }
  }

  const detectedMerchant = matchedByLanding || matchedByPasted || null;

  const problems: string[] = [];
  if (!detectedMerchant) {
    problems.push(`ไม่พบร้านค้าที่ตรงกับโดเมนปลายทาง ${finalHost}`);
  }
  const lastHop = hops[hops.length - 1];
  if (lastHop && (lastHop.status < 200 || lastHop.status >= 400)) {
    problems.push(`หน้าปลายทางตอบกลับด้วยรหัสข้อผิดพลาด ${lastHop.status}`);
  }

  const suggestedLabel = finalTitle || (detectedMerchant ? detectedMerchant.name : finalHost);
  const suggestedSlug = generateSuggestedSlug(
    detectedMerchant ? detectedMerchant.name : finalHost,
    suggestedLabel,
  );

  return {
    ok: true,
    data: {
      hops,
      finalUrl,
      finalHost,
      merchant: detectedMerchant
        ? {
            id: detectedMerchant.id,
            name: detectedMerchant.name,
            domain: detectedMerchant.domain,
            trackingHosts: parseTrackingHosts(detectedMerchant.trackingHostsJson),
          }
        : null,
      suggestedSlug,
      suggestedLabel,
      problems,
    },
  };
}

// ---------------------------------------------------------------- Helpers: Metrics (EPC & RPM)

/**
 * Computes Earnings Per Click (EPC) in integer satang.
 * Formula: commission ÷ clicks
 */
export function calculateEpc(commissionSatang: number, clicks: number): number {
  if (clicks <= 0 || commissionSatang <= 0) return 0;
  return Math.round(commissionSatang / clicks);
}

/**
 * Computes Revenue Per Mille (RPM) in integer satang.
 * Formula: (commission ÷ page_views) * 1000
 */
export function calculateRpm(commissionSatang: number, pageViews: number): number {
  if (pageViews <= 0 || commissionSatang <= 0) return 0;
  return Math.round((commissionSatang * 1000) / pageViews);
}

// ---------------------------------------------------------------- Helpers: CSV Parser

export interface ParsedCsvRow {
  rowNum: number;
  dateStr: string;
  merchantDomain: string;
  linkSlug?: string | null;
  externalId?: string | null;
  amountSatang?: number | null;
  commissionSatang: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface CsvParseResult {
  validRows: ParsedCsvRow[];
  skippedRows: Array<{ row: number; reason: string }>;
  rejectedRows: Array<{ row: number; reason: string }>;
}

/**
 * Robust CSV parser that handles quotes, escaped quotes, and CRLF.
 */
export function parseCsvLines(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  const len = csvText.length;
  while (i < len) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvText[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      currentField += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (char === '\r' && i + 1 < len && csvText[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Validates and maps CSV lines according to AFFILIATE §6:
 * columns: date, merchant_domain, link_slug?, external_id?, amount?, commission, status
 */
export async function processConversionsCsv(
  csvContent: string,
  db: ReturnType<typeof getDb>,
): Promise<CsvParseResult> {
  const lines = parseCsvLines(csvContent);
  if (lines.length < 2) {
    return {
      validRows: [],
      skippedRows: [],
      rejectedRows: [{ row: 1, reason: 'ไฟล์ CSV ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว' }],
    };
  }

  const rawHeaders = lines[0]!.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));
  const headerMap: Record<string, number> = {};
  rawHeaders.forEach((h, idx) => {
    headerMap[h] = idx;
  });

  const dateIdx = headerMap['date'] ?? 0;
  const domainIdx =
    headerMap['merchantdomain'] ?? headerMap['merchant'] ?? headerMap['domain'] ?? 1;
  const slugIdx = headerMap['linkslug'] ?? headerMap['slug'] ?? headerMap['link'] ?? 2;
  const extIdIdx = headerMap['externalid'] ?? headerMap['orderid'] ?? headerMap['id'] ?? 3;
  const amountIdx = headerMap['amount'] ?? headerMap['sales'] ?? 4;
  const commIdx = headerMap['commission'] ?? headerMap['revenue'] ?? 5;
  const statusIdx = headerMap['status'] ?? 6;

  const merchants = await db.select().from(schema.merchant);
  const merchantByDomain = new Map(merchants.map((m) => [m.domain.toLowerCase(), m]));

  const existingConversions = await db
    .select({
      merchantId: schema.affiliateConversion.merchantId,
      externalId: schema.affiliateConversion.externalId,
    })
    .from(schema.affiliateConversion)
    .where(sql`${schema.affiliateConversion.externalId} IS NOT NULL`);

  const seenExternalIds = new Set<string>();
  existingConversions.forEach((c) => {
    if (c.externalId) seenExternalIds.add(`${c.merchantId}:${c.externalId}`);
  });

  const validRows: ParsedCsvRow[] = [];
  const skippedRows: Array<{ row: number; reason: string }> = [];
  const rejectedRows: Array<{ row: number; reason: string }> = [];

  for (let r = 1; r < lines.length; r++) {
    const row = lines[r]!;
    const rowNum = r + 1;

    const dateVal = row[dateIdx]?.trim();
    const domainVal = row[domainIdx]?.toLowerCase().trim();
    const slugVal = row[slugIdx]?.trim() || null;
    const extIdVal = row[extIdIdx]?.trim() || null;
    const amountVal = row[amountIdx]?.trim();
    const commVal = row[commIdx]?.trim();
    const statusVal = (row[statusIdx]?.toLowerCase().trim() || 'pending') as
      'pending' | 'approved' | 'rejected';

    if (!dateVal) {
      rejectedRows.push({ row: rowNum, reason: 'ไม่พบข้อมูลวันที่ (date)' });
      continue;
    }
    const parsedDate = new Date(dateVal);
    if (isNaN(parsedDate.getTime())) {
      rejectedRows.push({ row: rowNum, reason: `รูปแบบวันที่ไม่ถูกต้อง: ${dateVal}` });
      continue;
    }

    if (!domainVal) {
      rejectedRows.push({ row: rowNum, reason: 'ไม่พบโดเมนร้านค้า (merchant_domain)' });
      continue;
    }
    const merchant = merchantByDomain.get(domainVal);
    if (!merchant) {
      rejectedRows.push({ row: rowNum, reason: `ไม่พบร้านค้าที่ตรงกับโดเมน ${domainVal}` });
      continue;
    }

    if (!commVal || isNaN(Number(commVal))) {
      rejectedRows.push({ row: rowNum, reason: `ค่าคอมมิชชันไม่ถูกต้อง: ${commVal || '(ว่าง)'}` });
      continue;
    }
    const commNumber = Number(commVal);
    if (commNumber < 0) {
      rejectedRows.push({ row: rowNum, reason: 'ค่าคอมมิชชันต้องไม่ติดลบ' });
      continue;
    }
    const commissionSatang = Math.round(commNumber * 100);

    let amountSatang: number | null = null;
    if (amountVal && !isNaN(Number(amountVal))) {
      amountSatang = Math.round(Number(amountVal) * 100);
    }

    if (extIdVal) {
      const extKey = `${merchant.id}:${extIdVal}`;
      if (seenExternalIds.has(extKey)) {
        skippedRows.push({ row: rowNum, reason: `external_id ซ้ำ (${extIdVal}) ข้ามรายการนี้` });
        continue;
      }
      seenExternalIds.add(extKey);
    }

    const validStatus = ['pending', 'approved', 'rejected'].includes(statusVal)
      ? statusVal
      : 'pending';

    validRows.push({
      rowNum,
      dateStr: dateVal.slice(0, 10),
      merchantDomain: domainVal,
      linkSlug: slugVal,
      externalId: extIdVal,
      amountSatang,
      commissionSatang,
      status: validStatus,
    });
  }

  return { validRows, skippedRows, rejectedRows };
}

// ---------------------------------------------------------------- Schemas

const CreateMerchantSchema = z.strictObject({
  name: z.string().trim().min(1, 'ต้องระบุชื่อร้านค้า').max(100),
  domain: z.string().trim().min(1, 'ต้องระบุโดเมนร้านค้า').toLowerCase(),
  trackingHosts: z.array(z.string().trim().toLowerCase()).max(10).optional().default([]),
  network: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const UpdateMerchantSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  domain: z.string().trim().min(1).toLowerCase().optional(),
  trackingHosts: z.array(z.string().trim().toLowerCase()).max(10).optional(),
  network: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const ResolveLinkSchema = z.strictObject({
  url: z.string().trim().min(1, 'ต้องระบุ URL ที่ต้องการตรวจสอบ'),
  merchantId: z.string().trim().optional(),
});

const CreateLinkSchema = z.strictObject({
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น')
    .max(80),
  merchantId: z.string().trim().min(1, 'ต้องระบุร้านค้า'),
  destinationUrl: z.string().trim().min(1, 'ต้องระบุ URL ปลายทาง'),
  fallbackUrl: z.string().trim().nullable().optional(),
  label: z.string().trim().min(1, 'ต้องระบุชื่อป้ายกำกับลิงก์').max(200),
  status: z.enum(['active', 'paused', 'broken']).optional().default('active'),
  expiresAt: z.number().int().nullable().optional(),
});

const UpdateLinkSchema = z.strictObject({
  slug: z
    .string()
    .trim()
    .regex(SLUG_REGEX, 'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น')
    .max(80)
    .optional(),
  merchantId: z.string().trim().min(1).optional(),
  destinationUrl: z.string().trim().min(1).optional(),
  fallbackUrl: z.string().trim().nullable().optional(),
  label: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'paused', 'broken']).optional(),
  expiresAt: z.number().int().nullable().optional(),
});

// ---------------------------------------------------------------- Hono Router

export const affiliateRoutes = new Hono<AppEnv>()

  // ================================================================ Merchants (E/A)

  // 1. GET /admin/affiliate/merchants (Role: E)
  .get('/admin/affiliate/merchants', requireSession, async (c) => {
    const db = getDb(c.env);
    const { page, limit } = parseQuery(c, paginationSchema);
    const offset = (page - 1) * limit;

    const [totalRes] = await db.select({ count: sql<number>`count(*)` }).from(schema.merchant);
    const total = Number(totalRes?.count ?? 0);

    const merchants = await db
      .select({
        id: schema.merchant.id,
        name: schema.merchant.name,
        domain: schema.merchant.domain,
        trackingHostsJson: schema.merchant.trackingHostsJson,
        network: schema.merchant.network,
        notes: schema.merchant.notes,
        createdAt: schema.merchant.createdAt,
        updatedAt: schema.merchant.updatedAt,
        linkCount: sql<number>`(select count(*) from ${schema.affiliateLink} where ${schema.affiliateLink.merchantId} = ${schema.merchant.id})`,
      })
      .from(schema.merchant)
      .orderBy(desc(schema.merchant.createdAt))
      .limit(limit)
      .offset(offset);

    const items = merchants.map((m) => ({
      id: m.id,
      name: m.name,
      domain: m.domain,
      trackingHosts: parseTrackingHosts(m.trackingHostsJson),
      network: m.network,
      notes: m.notes,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      linkCount: Number(m.linkCount ?? 0),
    }));

    return ok(c, { items, page, limit, total });
  })

  // 2. POST /admin/affiliate/merchants (Role: A)
  .post('/admin/affiliate/merchants', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const body = await parseBody(c, CreateMerchantSchema);
    const blocked = getEffectiveBlockedDomains();

    const domain = body.domain.toLowerCase().trim();
    if (isIpHost(domain)) {
      return fail(c, 422, 'URL_INVALID', 'โดเมนร้านค้าต้องไม่เป็น IP address');
    }

    if (isDomainBlocked(domain, blocked)) {
      return fail(c, 422, 'DOMAIN_BLOCKED', `โดเมน ${domain} อยู่ในรายการโดเมนที่ถูกบล็อก`);
    }

    // Check tracking hosts
    for (const th of body.trackingHosts) {
      if (isIpHost(th)) {
        return fail(c, 422, 'URL_INVALID', `Tracking host ${th} ต้องไม่เป็น IP address`);
      }
      if (isDomainBlocked(th, blocked)) {
        return fail(c, 422, 'DOMAIN_BLOCKED', `Tracking host ${th} อยู่ในรายการโดเมนที่ถูกบล็อก`);
      }
    }

    // Check domain uniqueness
    const [existing] = await db
      .select({ id: schema.merchant.id })
      .from(schema.merchant)
      .where(eq(schema.merchant.domain, domain))
      .limit(1);

    if (existing) {
      return fail(c, 409, 'MERCHANT_DOMAIN_EXISTS', 'โดเมนร้านค้านี้มีอยู่ในระบบแล้ว');
    }

    const now = Date.now();
    const merchantId = crypto.randomUUID();

    await db.insert(schema.merchant).values({
      id: merchantId,
      name: body.name,
      domain,
      trackingHostsJson: JSON.stringify(body.trackingHosts),
      network: body.network ?? null,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.merchant_create',
      targetType: 'merchant',
      targetId: merchantId,
      meta: { name: body.name, domain },
    });

    return ok(
      c,
      {
        id: merchantId,
        name: body.name,
        domain,
        trackingHosts: body.trackingHosts,
        network: body.network ?? null,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
      },
      201,
    );
  })

  // 3. PATCH /admin/affiliate/merchants/:id (Role: A)
  .patch('/admin/affiliate/merchants/:id', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const { id } = parseParams(c, z.object({ id: z.string().min(1) }));
    const body = await parseBody(c, UpdateMerchantSchema);
    const blocked = getEffectiveBlockedDomains();

    const [existing] = await db
      .select()
      .from(schema.merchant)
      .where(eq(schema.merchant.id, id))
      .limit(1);
    if (!existing) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบร้านค้าที่ต้องการแก้ไข');
    }

    let nextDomain = existing.domain;
    if (body.domain) {
      const cleanDomain = body.domain.toLowerCase().trim();
      if (isIpHost(cleanDomain)) {
        return fail(c, 422, 'URL_INVALID', 'โดเมนร้านค้าต้องไม่เป็น IP address');
      }
      if (isDomainBlocked(cleanDomain, blocked)) {
        return fail(c, 422, 'DOMAIN_BLOCKED', `โดเมน ${cleanDomain} อยู่ในรายการโดเมนที่ถูกบล็อก`);
      }
      if (cleanDomain !== existing.domain) {
        const [conflict] = await db
          .select({ id: schema.merchant.id })
          .from(schema.merchant)
          .where(and(eq(schema.merchant.domain, cleanDomain), ne(schema.merchant.id, id)))
          .limit(1);
        if (conflict) {
          return fail(c, 409, 'MERCHANT_DOMAIN_EXISTS', 'โดเมนร้านค้านี้มีอยู่ในระบบแล้ว');
        }
        nextDomain = cleanDomain;
      }
    }

    let nextTrackingHosts = parseTrackingHosts(existing.trackingHostsJson);
    if (body.trackingHosts) {
      for (const th of body.trackingHosts) {
        if (isIpHost(th)) {
          return fail(c, 422, 'URL_INVALID', `Tracking host ${th} ต้องไม่เป็น IP address`);
        }
        if (isDomainBlocked(th, blocked)) {
          return fail(c, 422, 'DOMAIN_BLOCKED', `Tracking host ${th} อยู่ในรายการโดเมนที่ถูกบล็อก`);
        }
      }
      nextTrackingHosts = body.trackingHosts;
    }

    const now = Date.now();
    await db
      .update(schema.merchant)
      .set({
        name: body.name ?? existing.name,
        domain: nextDomain,
        trackingHostsJson: JSON.stringify(nextTrackingHosts),
        network: body.network !== undefined ? body.network : existing.network,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        updatedAt: now,
      })
      .where(eq(schema.merchant.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.merchant_update',
      targetType: 'merchant',
      targetId: id,
      meta: { name: body.name ?? existing.name, domain: nextDomain },
    });

    return ok(c, {
      id,
      name: body.name ?? existing.name,
      domain: nextDomain,
      trackingHosts: nextTrackingHosts,
      network: body.network !== undefined ? body.network : existing.network,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
  })

  // 4. DELETE /admin/affiliate/merchants/:id (Role: A)
  .delete('/admin/affiliate/merchants/:id', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const { id } = parseParams(c, z.object({ id: z.string().min(1) }));

    const [existing] = await db
      .select()
      .from(schema.merchant)
      .where(eq(schema.merchant.id, id))
      .limit(1);
    if (!existing) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบร้านค้าที่ต้องการลบ');
    }

    // Check if merchant is in use by any link (AFFILIATE §6: 409 MERCHANT_IN_USE)
    const [linkCountRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.affiliateLink)
      .where(eq(schema.affiliateLink.merchantId, id));

    if (Number(linkCountRes?.count ?? 0) > 0) {
      return fail(c, 409, 'MERCHANT_IN_USE', 'ไม่สามารถลบร้านค้าที่มีลิงก์ affiliate ได้');
    }

    await db.delete(schema.merchant).where(eq(schema.merchant.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.merchant_delete',
      targetType: 'merchant',
      targetId: id,
      meta: { name: existing.name, domain: existing.domain },
    });

    return ok(c, { success: true });
  })

  // ================================================================ Links & Resolve

  // 5. POST /admin/affiliate/links/resolve (Role: A)
  .post('/admin/affiliate/links/resolve', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const body = await parseBody(c, ResolveLinkSchema);

    const result = await resolveRedirects(body.url, {
      db,
      expectedMerchantId: body.merchantId,
    });

    if (!result.ok) {
      return fail(c, 422, result.error.code, result.error.message);
    }

    return ok(c, result.data);
  })

  // 6. GET /admin/affiliate/links (Role: E)
  // Note: Editors never receive destination_url or fallback_url (AFFILIATE §6).
  .get('/admin/affiliate/links', requireSession, async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const isAdmin = user.role === 'admin';

    const querySchema = paginationSchema.extend({
      status: z.enum(['active', 'paused', 'broken']).optional(),
      merchantId: z.string().optional(),
      q: z.string().optional(),
    });
    const query = parseQuery(c, querySchema);
    const { page, limit, status, merchantId, q } = query;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) conditions.push(eq(schema.affiliateLink.status, status));
    if (merchantId) conditions.push(eq(schema.affiliateLink.merchantId, merchantId));
    if (q) {
      const search = `%${q.trim()}%`;
      conditions.push(
        sql`(${schema.affiliateLink.label} LIKE ${search} OR ${schema.affiliateLink.slug} LIKE ${search})`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.affiliateLink)
      .where(whereClause);
    const total = Number(totalRes?.count ?? 0);

    const now = Date.now();
    const day7Ago = bangkokDay(now - 7 * 86400_000);
    const day30Ago = bangkokDay(now - 30 * 86400_000);

    const rows = await db
      .select({
        id: schema.affiliateLink.id,
        slug: schema.affiliateLink.slug,
        merchantId: schema.affiliateLink.merchantId,
        merchantName: schema.merchant.name,
        merchantDomain: schema.merchant.domain,
        destinationUrl: schema.affiliateLink.destinationUrl,
        fallbackUrl: schema.affiliateLink.fallbackUrl,
        label: schema.affiliateLink.label,
        status: schema.affiliateLink.status,
        expiresAt: schema.affiliateLink.expiresAt,
        lastCheckedAt: schema.affiliateLink.lastCheckedAt,
        lastCheckStatus: schema.affiliateLink.lastCheckStatus,
        lastCheckHops: schema.affiliateLink.lastCheckHops,
        createdAt: schema.affiliateLink.createdAt,
        updatedAt: schema.affiliateLink.updatedAt,
      })
      .from(schema.affiliateLink)
      .leftJoin(schema.merchant, eq(schema.affiliateLink.merchantId, schema.merchant.id))
      .where(whereClause)
      .orderBy(desc(schema.affiliateLink.createdAt))
      .limit(limit)
      .offset(offset);

    // Aggregate clicks 7d & 30d per link from affiliateClickDaily
    const linkIds = rows.map((r) => r.id);
    const clickStatsMap = new Map<string, { clicks7d: number; clicks30d: number }>();

    if (linkIds.length > 0) {
      const clickDailyRows = await db
        .select({
          linkId: schema.affiliateClickDaily.linkId,
          day: schema.affiliateClickDaily.day,
          clicks: schema.affiliateClickDaily.clicks,
        })
        .from(schema.affiliateClickDaily)
        .where(
          and(
            inArray(schema.affiliateClickDaily.linkId, linkIds),
            sql`${schema.affiliateClickDaily.day} >= ${day30Ago}`,
          ),
        );

      clickDailyRows.forEach((r) => {
        const current = clickStatsMap.get(r.linkId) || { clicks7d: 0, clicks30d: 0 };
        current.clicks30d += Number(r.clicks || 0);
        if (r.day >= day7Ago) {
          current.clicks7d += Number(r.clicks || 0);
        }
        clickStatsMap.set(r.linkId, current);
      });
    }

    const items = rows.map((r) => {
      const stats = clickStatsMap.get(r.id) || { clicks7d: 0, clicks30d: 0 };
      const item: Record<string, unknown> = {
        id: r.id,
        slug: r.slug,
        merchantId: r.merchantId,
        merchantName: r.merchantName ?? '',
        merchantDomain: r.merchantDomain ?? '',
        label: r.label,
        status: r.status,
        expiresAt: r.expiresAt,
        lastCheckedAt: r.lastCheckedAt,
        lastCheckStatus: r.lastCheckStatus,
        lastCheckHops: r.lastCheckHops,
        clicks7d: stats.clicks7d,
        clicks30d: stats.clicks30d,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };

      if (isAdmin) {
        item.destinationUrl = r.destinationUrl;
        item.fallbackUrl = r.fallbackUrl;
      }

      return item;
    });

    return ok(c, { items, page, limit, total });
  })

  // 7. GET /admin/affiliate/links/:id (Role: E)
  .get('/admin/affiliate/links/:id', requireSession, async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const isAdmin = user.role === 'admin';
    const { id } = parseParams(c, z.object({ id: z.string().min(1) }));

    const [row] = await db
      .select({
        id: schema.affiliateLink.id,
        slug: schema.affiliateLink.slug,
        merchantId: schema.affiliateLink.merchantId,
        merchantName: schema.merchant.name,
        merchantDomain: schema.merchant.domain,
        destinationUrl: schema.affiliateLink.destinationUrl,
        fallbackUrl: schema.affiliateLink.fallbackUrl,
        label: schema.affiliateLink.label,
        status: schema.affiliateLink.status,
        expiresAt: schema.affiliateLink.expiresAt,
        lastCheckedAt: schema.affiliateLink.lastCheckedAt,
        lastCheckStatus: schema.affiliateLink.lastCheckStatus,
        lastCheckHops: schema.affiliateLink.lastCheckHops,
        createdAt: schema.affiliateLink.createdAt,
        updatedAt: schema.affiliateLink.updatedAt,
      })
      .from(schema.affiliateLink)
      .leftJoin(schema.merchant, eq(schema.affiliateLink.merchantId, schema.merchant.id))
      .where(eq(schema.affiliateLink.id, id))
      .limit(1);

    if (!row) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบลิงก์ affiliate ที่ต้องการ');
    }

    // Query articles referencing this link
    const allArticles = await db
      .select({
        id: schema.article.id,
        title: schema.article.title,
        slug: schema.article.slug,
        status: schema.article.status,
        contentJson: schema.article.contentJson,
      })
      .from(schema.article);

    const articles = allArticles
      .filter((a) => a.contentJson && a.contentJson.includes(id))
      .map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
      }));

    const result: Record<string, unknown> = {
      id: row.id,
      slug: row.slug,
      merchantId: row.merchantId,
      merchantName: row.merchantName ?? '',
      merchantDomain: row.merchantDomain ?? '',
      label: row.label,
      status: row.status,
      expiresAt: row.expiresAt,
      lastCheckedAt: row.lastCheckedAt,
      lastCheckStatus: row.lastCheckStatus,
      lastCheckHops: row.lastCheckHops,
      articles,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    if (isAdmin) {
      result.destinationUrl = row.destinationUrl;
      result.fallbackUrl = row.fallbackUrl;
    }

    return ok(c, result);
  })

  // 8. POST /admin/affiliate/links (Role: A)
  .post('/admin/affiliate/links', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const body = await parseBody(c, CreateLinkSchema);
    const blocked = getEffectiveBlockedDomains();

    // Verify merchant exists
    const [merchant] = await db
      .select()
      .from(schema.merchant)
      .where(eq(schema.merchant.id, body.merchantId))
      .limit(1);

    if (!merchant) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบร้านค้าที่ระบุ');
    }

    // Verify slug uniqueness
    const [existingSlug] = await db
      .select({ id: schema.affiliateLink.id })
      .from(schema.affiliateLink)
      .where(eq(schema.affiliateLink.slug, body.slug))
      .limit(1);

    if (existingSlug) {
      return fail(c, 409, 'SLUG_TAKEN', 'Slug นี้ถูกใช้งานแล้ว กรุณาระบุชื่ออื่น');
    }

    // Validate destination URL rules
    const resolveRes = await resolveRedirects(body.destinationUrl, {
      db,
      blockedDomains: blocked,
      expectedMerchantId: body.merchantId,
    });

    if (!resolveRes.ok) {
      return fail(c, 422, resolveRes.error.code, resolveRes.error.message);
    }

    // Validate fallback URL if provided
    if (body.fallbackUrl) {
      const fallbackCheck = validateDestinationUrl(body.fallbackUrl, blocked);
      if (!fallbackCheck.valid) {
        return fail(
          c,
          422,
          fallbackCheck.error.code,
          `Fallback URL: ${fallbackCheck.error.message}`,
        );
      }
    }

    const now = Date.now();
    const linkId = crypto.randomUUID();

    // Stored URL is the pasted one unchanged (AFFILIATE §6)
    await db.insert(schema.affiliateLink).values({
      id: linkId,
      slug: body.slug,
      merchantId: body.merchantId,
      destinationUrl: body.destinationUrl,
      fallbackUrl: body.fallbackUrl ?? null,
      label: body.label,
      status: body.status,
      expiresAt: body.expiresAt ?? null,
      lastCheckedAt: now,
      lastCheckStatus: String(resolveRes.data.hops[resolveRes.data.hops.length - 1]?.status ?? 200),
      lastCheckHops: resolveRes.data.hops.length,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.link_create',
      targetType: 'affiliate_link',
      targetId: linkId,
      meta: { slug: body.slug, label: body.label, merchantId: body.merchantId },
    });

    return ok(
      c,
      {
        id: linkId,
        slug: body.slug,
        merchantId: body.merchantId,
        destinationUrl: body.destinationUrl,
        fallbackUrl: body.fallbackUrl ?? null,
        label: body.label,
        status: body.status,
        expiresAt: body.expiresAt ?? null,
        createdAt: now,
        updatedAt: now,
      },
      201,
    );
  })

  // 9. PATCH /admin/affiliate/links/:id (Role: A)
  .patch('/admin/affiliate/links/:id', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const { id } = parseParams(c, z.object({ id: z.string().min(1) }));
    const body = await parseBody(c, UpdateLinkSchema);
    const blocked = getEffectiveBlockedDomains();

    const [existing] = await db
      .select()
      .from(schema.affiliateLink)
      .where(eq(schema.affiliateLink.id, id))
      .limit(1);

    if (!existing) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบลิงก์ที่ต้องการแก้ไข');
    }

    const merchantId = body.merchantId ?? existing.merchantId;
    const [merchant] = await db
      .select()
      .from(schema.merchant)
      .where(eq(schema.merchant.id, merchantId))
      .limit(1);

    if (!merchant) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบร้านค้าที่ระบุ');
    }

    // Slug check if changed
    if (body.slug && body.slug !== existing.slug) {
      const [conflict] = await db
        .select({ id: schema.affiliateLink.id })
        .from(schema.affiliateLink)
        .where(and(eq(schema.affiliateLink.slug, body.slug), ne(schema.affiliateLink.id, id)))
        .limit(1);
      if (conflict) {
        return fail(c, 409, 'SLUG_TAKEN', 'Slug นี้ถูกใช้งานแล้ว กรุณาระบุชื่ออื่น');
      }
    }

    // If destinationUrl is changed, re-run resolve check
    let lastCheckedAt = existing.lastCheckedAt;
    let lastCheckStatus = existing.lastCheckStatus;
    let lastCheckHops = existing.lastCheckHops;

    if (body.destinationUrl && body.destinationUrl !== existing.destinationUrl) {
      const resolveRes = await resolveRedirects(body.destinationUrl, {
        db,
        blockedDomains: blocked,
        expectedMerchantId: merchantId,
      });

      if (!resolveRes.ok) {
        return fail(c, 422, resolveRes.error.code, resolveRes.error.message);
      }

      lastCheckedAt = Date.now();
      lastCheckStatus = String(
        resolveRes.data.hops[resolveRes.data.hops.length - 1]?.status ?? 200,
      );
      lastCheckHops = resolveRes.data.hops.length;
    }

    if (body.fallbackUrl) {
      const fallbackCheck = validateDestinationUrl(body.fallbackUrl, blocked);
      if (!fallbackCheck.valid) {
        return fail(
          c,
          422,
          fallbackCheck.error.code,
          `Fallback URL: ${fallbackCheck.error.message}`,
        );
      }
    }

    const now = Date.now();
    await db
      .update(schema.affiliateLink)
      .set({
        slug: body.slug ?? existing.slug,
        merchantId,
        destinationUrl: body.destinationUrl ?? existing.destinationUrl,
        fallbackUrl: body.fallbackUrl !== undefined ? body.fallbackUrl : existing.fallbackUrl,
        label: body.label ?? existing.label,
        status: body.status ?? existing.status,
        expiresAt: body.expiresAt !== undefined ? body.expiresAt : existing.expiresAt,
        lastCheckedAt,
        lastCheckStatus,
        lastCheckHops,
        updatedAt: now,
      })
      .where(eq(schema.affiliateLink.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.link_update',
      targetType: 'affiliate_link',
      targetId: id,
      meta: { slug: body.slug ?? existing.slug, label: body.label ?? existing.label },
    });

    return ok(c, {
      id,
      slug: body.slug ?? existing.slug,
      merchantId,
      destinationUrl: body.destinationUrl ?? existing.destinationUrl,
      fallbackUrl: body.fallbackUrl !== undefined ? body.fallbackUrl : existing.fallbackUrl,
      label: body.label ?? existing.label,
      status: body.status ?? existing.status,
      expiresAt: body.expiresAt !== undefined ? body.expiresAt : existing.expiresAt,
      lastCheckedAt,
      lastCheckStatus,
      lastCheckHops,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
  })

  // 10. DELETE /admin/affiliate/links/:id (Role: A)
  // 409 LINK_IN_USE if a published article references it (AFFILIATE §6).
  .delete('/admin/affiliate/links/:id', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const { id } = parseParams(c, z.object({ id: z.string().min(1) }));

    const [existing] = await db
      .select()
      .from(schema.affiliateLink)
      .where(eq(schema.affiliateLink.id, id))
      .limit(1);

    if (!existing) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบลิงก์ที่ต้องการลบ');
    }

    // Check if any published article references it
    const publishedArticles = await db
      .select({
        id: schema.article.id,
        title: schema.article.title,
        contentJson: schema.article.contentJson,
      })
      .from(schema.article)
      .where(eq(schema.article.status, 'published'));

    const inUse = publishedArticles.some((a) => a.contentJson && a.contentJson.includes(id));
    if (inUse) {
      return fail(
        c,
        409,
        'LINK_IN_USE',
        'ไม่สามารถลบลิงก์ที่ถูกใช้งานในบทความที่เผยแพร่แล้วได้ กรุณาแก้ไขหรือยกเลิกการเผยแพร่บทความก่อน',
      );
    }

    await db.delete(schema.affiliateLink).where(eq(schema.affiliateLink.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.link_delete',
      targetType: 'affiliate_link',
      targetId: id,
      meta: { slug: existing.slug, label: existing.label },
    });

    return ok(c, { success: true });
  })

  // 11. POST /admin/affiliate/links/:id/check (Role: A)
  .post('/admin/affiliate/links/:id/check', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;
    const { id } = parseParams(c, z.object({ id: z.string().min(1) }));

    const [existing] = await db
      .select()
      .from(schema.affiliateLink)
      .where(eq(schema.affiliateLink.id, id))
      .limit(1);

    if (!existing) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบลิงก์ที่ต้องการตรวจสอบ');
    }

    const resolveRes = await resolveRedirects(existing.destinationUrl, {
      db,
      expectedMerchantId: existing.merchantId,
    });

    const now = Date.now();
    let finalStatus = 'error';
    let hopsCount = 0;
    let isOk = false;

    if (resolveRes.ok) {
      hopsCount = resolveRes.data.hops.length;
      finalStatus = String(resolveRes.data.hops[resolveRes.data.hops.length - 1]?.status ?? 200);
      isOk = resolveRes.data.problems.length === 0;
    } else {
      finalStatus = resolveRes.error.code;
    }

    await db
      .update(schema.affiliateLink)
      .set({
        lastCheckedAt: now,
        lastCheckStatus: finalStatus,
        lastCheckHops: hopsCount,
        updatedAt: now,
      })
      .where(eq(schema.affiliateLink.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.link_check',
      targetType: 'affiliate_link',
      targetId: id,
      meta: { status: finalStatus, hops: hopsCount, ok: isOk },
    });

    return ok(c, {
      linkId: id,
      lastCheckedAt: now,
      lastCheckStatus: finalStatus,
      lastCheckHops: hopsCount,
      ok: isOk,
      hops: resolveRes.ok ? resolveRes.data.hops : [],
    });
  })

  // ================================================================ Conversions (CSV Import)

  // 12. POST /admin/affiliate/conversions/import (Role: A)
  .post('/admin/affiliate/conversions/import', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const user = c.get('user') as SessionUser;

    let csvText = '';
    let isPreview = false;

    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const file = formData.get('file');
      isPreview = formData.get('preview') === 'true';

      if (!file || typeof file === 'string' || !(typeof file === 'object' && 'text' in file)) {
        return fail(c, 400, 'INVALID_CSV', 'กรุณาอัปโหลดไฟล์ CSV');
      }
      csvText = await (file as File).text();
    } else {
      let body: { csv?: string; preview?: boolean };
      try {
        body = await c.req.json();
      } catch {
        return fail(c, 400, 'INVALID_CSV', 'รูปแบบข้อมูลไม่ถูกต้อง');
      }
      csvText = body.csv || '';
      isPreview = Boolean(body.preview);
    }

    if (!csvText.trim()) {
      return fail(c, 400, 'INVALID_CSV', 'เนื้อหาไฟล์ CSV ว่างเปล่า');
    }

    const { validRows, skippedRows, rejectedRows } = await processConversionsCsv(csvText, db);

    if (isPreview) {
      return ok(c, {
        preview: validRows,
        imported: 0,
        skipped: skippedRows.length,
        rejected: rejectedRows.length,
        reasons: [...skippedRows, ...rejectedRows].sort((a, b) => a.row - b.row),
      });
    }

    // Insert valid non-skipped rows
    if (validRows.length > 0) {
      const merchants = await db.select().from(schema.merchant);
      const merchantMap = new Map(merchants.map((m) => [m.domain.toLowerCase(), m.id]));

      const links = await db.select().from(schema.affiliateLink);
      const linkMap = new Map(links.map((l) => [l.slug.toLowerCase(), l.id]));

      const now = Date.now();
      const insertValues = validRows.map((row) => {
        const merchantId = merchantMap.get(row.merchantDomain)!;
        const linkId = row.linkSlug ? (linkMap.get(row.linkSlug.toLowerCase()) ?? null) : null;
        const occurredAt = new Date(row.dateStr).getTime() || now;

        return {
          id: crypto.randomUUID(),
          linkId,
          merchantId,
          occurredAt,
          day: row.dateStr,
          amountSatang: row.amountSatang ?? null,
          commissionSatang: row.commissionSatang,
          currency: 'THB',
          status: row.status,
          externalId: row.externalId ?? null,
          source: 'csv' as const,
          createdAt: now,
        };
      });

      // Insert in batches of 50 to avoid SQLite parameter limits
      const batchSize = 50;
      for (let i = 0; i < insertValues.length; i += batchSize) {
        const batch = insertValues.slice(i, i + batchSize);
        await db.insert(schema.affiliateConversion).values(batch);
      }
    }

    await recordAudit(db, {
      actorId: user.id,
      action: 'affiliate.conversion_import',
      targetType: 'affiliate_conversion',
      meta: {
        imported: validRows.length,
        skipped: skippedRows.length,
        rejected: rejectedRows.length,
      },
    });

    return ok(c, {
      imported: validRows.length,
      skipped: skippedRows.length,
      rejected: rejectedRows.length,
      reasons: [...skippedRows, ...rejectedRows].sort((a, b) => a.row - b.row),
    });
  })

  // ================================================================ Reports & Dashboard

  // 13. GET /admin/affiliate/report?days=30&by=link|article (Role: E)
  .get('/admin/affiliate/report', requireSession, async (c) => {
    const db = getDb(c.env);
    const query = parseQuery(
      c,
      z.object({
        days: z.coerce
          .number()
          .int()
          .refine((d) => [7, 30, 90].includes(d))
          .default(30),
        by: z.enum(['link', 'article']).default('link'),
      }),
    );

    const { days, by } = query;
    const now = Date.now();
    const startDate = bangkokDay(now - days * 86400_000);
    const endDate = bangkokDay(now);

    // Get daily click rollups within window
    const clickDailyRows = await db
      .select({
        linkId: schema.affiliateClickDaily.linkId,
        articleId: schema.affiliateClickDaily.articleId,
        day: schema.affiliateClickDaily.day,
        clicks: schema.affiliateClickDaily.clicks,
        uniqueClicks: schema.affiliateClickDaily.uniqueClicks,
      })
      .from(schema.affiliateClickDaily)
      .where(sql`${schema.affiliateClickDaily.day} >= ${startDate}`);

    // Get conversions within window
    const conversionRows = await db
      .select({
        id: schema.affiliateConversion.id,
        linkId: schema.affiliateConversion.linkId,
        merchantId: schema.affiliateConversion.merchantId,
        day: schema.affiliateConversion.day,
        amountSatang: schema.affiliateConversion.amountSatang,
        commissionSatang: schema.affiliateConversion.commissionSatang,
        status: schema.affiliateConversion.status,
      })
      .from(schema.affiliateConversion)
      .where(
        and(
          sql`${schema.affiliateConversion.day} >= ${startDate}`,
          ne(schema.affiliateConversion.status, 'rejected'),
        ),
      );

    // Get page views from page_stat_daily within window
    const pageStatRows = await db
      .select({
        path: schema.pageStatDaily.path,
        day: schema.pageStatDaily.day,
        views: schema.pageStatDaily.views,
        visits: schema.pageStatDaily.visits,
      })
      .from(schema.pageStatDaily)
      .where(sql`${schema.pageStatDaily.day} >= ${startDate}`);

    // Daily series aggregation for chart
    const dailyMap = new Map<
      string,
      { clicks: number; conversions: number; commissionSatang: number }
    >();
    for (let d = days; d >= 0; d--) {
      const dayStr = bangkokDay(now - d * 86400_000);
      dailyMap.set(dayStr, { clicks: 0, conversions: 0, commissionSatang: 0 });
    }

    clickDailyRows.forEach((r) => {
      const entry = dailyMap.get(r.day);
      if (entry) entry.clicks += Number(r.clicks || 0);
    });

    conversionRows.forEach((r) => {
      const entry = dailyMap.get(r.day);
      if (entry) {
        entry.conversions += 1;
        entry.commissionSatang += Number(r.commissionSatang || 0);
      }
    });

    const daily = Array.from(dailyMap.entries())
      .map(([day, val]) => ({
        day,
        clicks: val.clicks,
        conversions: val.conversions,
        commissionSatang: val.commissionSatang,
      }))
      .sort((a, b) => a.day.localeCompare(b.day));

    let items: Array<Record<string, unknown>> = [];

    if (by === 'link') {
      const links = await db
        .select({
          id: schema.affiliateLink.id,
          slug: schema.affiliateLink.slug,
          label: schema.affiliateLink.label,
          status: schema.affiliateLink.status,
          merchantId: schema.affiliateLink.merchantId,
          merchantName: schema.merchant.name,
          merchantDomain: schema.merchant.domain,
        })
        .from(schema.affiliateLink)
        .leftJoin(schema.merchant, eq(schema.affiliateLink.merchantId, schema.merchant.id));

      const allArticles = await db
        .select({
          id: schema.article.id,
          slug: schema.article.slug,
          contentJson: schema.article.contentJson,
        })
        .from(schema.article)
        .where(eq(schema.article.status, 'published'));

      items = links.map((link) => {
        let clicks = 0;
        let uniqueClicks = 0;
        clickDailyRows.forEach((c) => {
          if (c.linkId === link.id) {
            clicks += Number(c.clicks || 0);
            uniqueClicks += Number(c.uniqueClicks || 0);
          }
        });

        let conversions = 0;
        let commissionSatang = 0;
        let amountSatang = 0;
        conversionRows.forEach((conv) => {
          if (conv.linkId === link.id) {
            conversions += 1;
            commissionSatang += Number(conv.commissionSatang || 0);
            amountSatang += Number(conv.amountSatang || 0);
          }
        });

        // Sum page views of published articles containing this link
        const articlesWithLink = allArticles.filter(
          (a) => a.contentJson && a.contentJson.includes(link.id),
        );
        let pageViews = 0;
        articlesWithLink.forEach((a) => {
          const articlePath = `/${a.slug}/`;
          pageStatRows.forEach((ps) => {
            if (ps.path === articlePath) {
              pageViews += Number(ps.views || 0);
            }
          });
        });

        const epcSatang = calculateEpc(commissionSatang, clicks);
        const rpmSatang = calculateRpm(commissionSatang, pageViews);

        return {
          id: link.id,
          slug: link.slug,
          label: link.label,
          status: link.status,
          merchantName: link.merchantName ?? '',
          merchantDomain: link.merchantDomain ?? '',
          clicks,
          uniqueClicks,
          conversions,
          commissionSatang,
          amountSatang,
          pageViews,
          epcSatang,
          rpmSatang,
        };
      });
    } else {
      // by === 'article'
      const articles = await db
        .select({
          id: schema.article.id,
          title: schema.article.title,
          slug: schema.article.slug,
          status: schema.article.status,
          publishedAt: schema.article.publishedAt,
          contentJson: schema.article.contentJson,
        })
        .from(schema.article)
        .where(eq(schema.article.status, 'published'));

      items = articles.map((article) => {
        let clicks = 0;
        let uniqueClicks = 0;
        clickDailyRows.forEach((c) => {
          if (c.articleId === article.id) {
            clicks += Number(c.clicks || 0);
            uniqueClicks += Number(c.uniqueClicks || 0);
          }
        });

        const articlePath = `/${article.slug}/`;
        let pageViews = 0;
        pageStatRows.forEach((ps) => {
          if (ps.path === articlePath) {
            pageViews += Number(ps.views || 0);
          }
        });

        // Find links in this article
        let conversions = 0;
        let commissionSatang = 0;
        conversionRows.forEach((conv) => {
          if (conv.linkId && article.contentJson && article.contentJson.includes(conv.linkId)) {
            conversions += 1;
            commissionSatang += Number(conv.commissionSatang || 0);
          }
        });

        const epcSatang = calculateEpc(commissionSatang, clicks);
        const rpmSatang = calculateRpm(commissionSatang, pageViews);

        return {
          id: article.id,
          title: article.title,
          slug: article.slug,
          status: article.status,
          publishedAt: article.publishedAt,
          clicks,
          uniqueClicks,
          conversions,
          commissionSatang,
          pageViews,
          epcSatang,
          rpmSatang,
        };
      });
    }

    // Overall summary metrics
    const totalClicks = items.reduce((acc, it) => acc + (Number(it.clicks) || 0), 0);
    const totalUniqueClicks = items.reduce((acc, it) => acc + (Number(it.uniqueClicks) || 0), 0);
    const totalConversions = items.reduce((acc, it) => acc + (Number(it.conversions) || 0), 0);
    const totalCommissionSatang = items.reduce(
      (acc, it) => acc + (Number(it.commissionSatang) || 0),
      0,
    );
    const totalPageViews = items.reduce((acc, it) => acc + (Number(it.pageViews) || 0), 0);

    const avgEpcSatang = calculateEpc(totalCommissionSatang, totalClicks);
    const avgRpmSatang = calculateRpm(totalCommissionSatang, totalPageViews);

    return ok(c, {
      summary: {
        totalClicks,
        totalUniqueClicks,
        totalConversions,
        totalCommissionSatang,
        totalPageViews,
        avgEpcSatang,
        avgRpmSatang,
      },
      items,
      daily,
      period: { days, startDate, endDate },
    });
  })

  // 14. GET /admin/affiliate/dashboard (Role: E)
  // Data for dashboard card: broken links, links expiring within 14 days, D1 writes today vs budget.
  .get('/admin/affiliate/dashboard', requireSession, async (c) => {
    const db = getDb(c.env);
    const now = Date.now();
    const in14Days = now + 14 * 86400_000;
    const todayStr = bangkokDay(now);

    // 1. Broken links count
    const [brokenRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.affiliateLink)
      .where(eq(schema.affiliateLink.status, 'broken'));
    const brokenLinksCount = Number(brokenRes?.count ?? 0);

    // 2. Links expiring within 14 days
    const [expiringRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.affiliateLink)
      .where(
        and(
          eq(schema.affiliateLink.status, 'active'),
          sql`${schema.affiliateLink.expiresAt} IS NOT NULL`,
          sql`${schema.affiliateLink.expiresAt} <= ${in14Days}`,
        ),
      );
    const expiringLinksCount = Number(expiringRes?.count ?? 0);

    // 3. D1 writes today vs 100k budget
    const budget = 100_000;
    let written = 0;

    // Optional Cloudflare GraphQL query if tokens configured
    if (c.env.CF_ANALYTICS_API_TOKEN && c.env.CF_ACCOUNT_ID) {
      try {
        const query = `
          query ($acc: String!) {
            viewer {
              accounts(filter: { accountTag: $acc }) {
                d1AnalyticsAdaptiveGroups(limit: 10) {
                  sum {
                    rowsWritten
                  }
                }
              }
            }
          }
        `;
        const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.CF_ANALYTICS_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables: { acc: c.env.CF_ACCOUNT_ID } }),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            data?: {
              viewer?: {
                accounts?: Array<{
                  d1AnalyticsAdaptiveGroups?: Array<{ sum?: { rowsWritten?: number } }>;
                }>;
              };
            };
          };
          const rowWrites =
            json?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups?.[0]?.sum?.rowsWritten;
          if (typeof rowWrites === 'number') {
            written = rowWrites;
          }
        }
      } catch {
        // Fall back to D1 clicks count on error
      }
    }

    if (written === 0) {
      const [todayClicks] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.affiliateClick)
        .where(eq(schema.affiliateClick.day, todayStr));
      // Each click is 1 row write in affiliate_click plus 1 index write
      written = Number(todayClicks?.count ?? 0) * 2;
    }

    const percent = Math.min(100, Math.round((written / budget) * 100));

    return ok(c, {
      brokenLinksCount,
      expiringLinksCount,
      d1WritesToday: {
        written,
        budget,
        percent,
      },
    });
  });
