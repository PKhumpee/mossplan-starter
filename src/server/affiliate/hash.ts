// Affiliate tracking helpers (AFFILIATE §3, §4, S6).

/**
 * Computes a day-scoped, HMAC-SHA-256 hash of the client IP.
 * Uses CLICK_HASH_SECRET and day + ip, truncated to the first 32 hex characters.
 * The raw IP is never stored, and readers cannot be tracked across days.
 */
export async function ipHash(secret: string, day: string, ip: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(day + ip));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/**
 * Classifies a user-agent into 'mobile', 'desktop', or 'other'.
 */
export function deviceClass(ua: string | null | undefined): 'mobile' | 'desktop' | 'other' {
  if (!ua) return 'other';
  if (/mobile|android|iphone|ipad|ipod|windows phone|iemobile|opera mini/i.test(ua)) {
    return 'mobile';
  }
  if (/windows|macintosh|mac os x|linux|cros/i.test(ua)) {
    return 'desktop';
  }
  return 'other';
}

/**
 * Formats epoch ms into a Bangkok calendar day (YYYY-MM-DD, UTC+7).
 */
export function bangkokDay(ms: number = Date.now()): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}
