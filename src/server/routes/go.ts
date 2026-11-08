import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { isBot } from '../affiliate/bots';
import { bangkokDay, deviceClass, ipHash } from '../affiliate/hash';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';
import type { AppEnv } from '../http/types';

// Slug regex per AFFILIATE §3: ^/go/([a-z0-9]+(?:-[a-z0-9]+)*)/?$
export const GO_SLUG_REGEX = /^\/go\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function respond404(request: Request, env: Env): Promise<Response> {
  const isHead = request.method === 'HEAD';
  if (env.ASSETS) {
    try {
      const assetUrl = new URL('/404.html', request.url);
      const assetRes = await env.ASSETS.fetch(assetUrl);
      if (assetRes.ok) {
        return new Response(isHead ? null : assetRes.body, {
          status: 404,
          headers: {
            'Content-Type': assetRes.headers.get('Content-Type') ?? 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        });
      }
    } catch {
      // Fall through to fallback text if ASSETS fetch is not available
    }
  }

  return new Response(
    isHead
      ? null
      : '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>ไม่พบหน้าที่ต้องการ</title></head><body><p>404 ไม่พบหน้าที่ต้องการ</p></body></html>',
    {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}

function createRedirectResponse(url: string, isHead: boolean): Response {
  const headers = new Headers({
    Location: url,
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Type': 'text/html; charset=utf-8',
  });

  const body = isHead
    ? null
    : `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>กำลังนำทาง...</title></head><body><p>หากระบบไม่เปลี่ยนหน้าโดยอัตโนมัติ กรุณา<a href="${escapeHtml(url)}">คลิกที่นี่</a></p></body></html>`;

  return new Response(body, {
    status: 302,
    headers,
  });
}

export const goRoutes = new Hono<AppEnv>();

goRoutes.all('*', async (c) => {
  const { pathname } = new URL(c.req.url);
  const match = GO_SLUG_REGEX.exec(pathname);
  if (!match) {
    return respond404(c.req.raw, c.env);
  }

  const slug = match[1]!;
  const db = getDb(c.env);
  const link = await db
    .select()
    .from(schema.affiliateLink)
    .where(eq(schema.affiliateLink.slug, slug))
    .get();

  // Step 3: Not found -> 404. status = 'paused' or 'broken' -> 302 to fallback_url if set, else 404. Nothing logged.
  if (!link) {
    return respond404(c.req.raw, c.env);
  }

  const isHead = c.req.method === 'HEAD';

  if (link.status === 'paused' || link.status === 'broken') {
    if (link.fallbackUrl && link.fallbackUrl.trim() !== '') {
      return createRedirectResponse(link.fallbackUrl, isHead);
    }
    return respond404(c.req.raw, c.env);
  }

  // Step 4 & 5: status = 'active' -> log click in waitUntil unless bot or HEAD
  const ua = c.req.header('user-agent') ?? '';
  if (!isHead && !isBot(ua)) {
    const now = Date.now();
    const day = bangkokDay(now);
    const rawIp =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      '0.0.0.0';

    let refererPath: string | null = null;
    const referer = c.req.header('referer');
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const reqUrl = new URL(c.req.url);
        const siteUrlOrigin = c.env.SITE_URL ? new URL(c.env.SITE_URL).origin : null;
        if (refUrl.origin === reqUrl.origin || refUrl.origin === siteUrlOrigin) {
          refererPath = refUrl.pathname;
        }
      } catch {
        // malformed referer
      }
    }

    const rawCountry =
      (c.req.raw as { cf?: { country?: string } }).cf?.country ??
      c.req.header('cf-ipcountry') ??
      null;
    const country = rawCountry ? rawCountry.toUpperCase().slice(0, 2) : null;
    const device = deviceClass(ua);

    const logPromise = (async () => {
      try {
        const hashSecret = c.env.CLICK_HASH_SECRET ?? 'dev-click-hash-secret';
        const hash = await ipHash(hashSecret, day, rawIp);
        await db.insert(schema.affiliateClick).values({
          id: crypto.randomUUID(),
          linkId: link.id,
          clickedAt: now,
          day,
          refererPath,
          ipHash: hash,
          country,
          device,
        });
      } catch (err) {
        console.error('Failed to log affiliate click:', err);
      }
    })();

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(logPromise);
    } else {
      logPromise.catch(() => {});
    }
  }

  // Step 6: 302 with Location, Cache-Control: no-store, X-Robots-Tag: noindex, nofollow, Referrer-Policy
  return createRedirectResponse(link.destinationUrl, isHead);
});
