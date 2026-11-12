// Custom Worker entry (wrangler.jsonc `main`). Astro serves pages; cron triggers go to
// src/server/scheduled.ts.
import astro from '@astrojs/cloudflare/entrypoints/server';
import { app } from './server/app';
import { getDb } from './server/db/client';
import { findMatchingRedirect, resolveRedirectFromDb } from './server/db/redirects';
import { getSiteSettings, resolveIndexing, runtimeOrigin } from './server/db/site-settings';
import type { Env } from './server/env';
import { canonicalRedirect } from './server/http/canonical-redirect';
import { finalizeSecurity, stripConditionalForPages } from './server/http/security';
import { staticRedirects } from './server/redirects-data';
import { goRoutes } from './server/routes/go';
import { ensureMigrationsOnce } from './server/routes/health';
import { handleScheduled } from './server/scheduled';
import { robotsContentForRuntime } from './lib/seo/robots';

/**
 * Determines whether X-Robots-Tag: noindex, nofollow should be added to the response.
 * Indexing requires a configured site URL, completed setup, matching request host, the enabled D1
 * switch, and PUBLIC_NOINDEX !== "true" (D-001). Missing settings and lookup errors fail closed.
 */
export async function shouldApplyNoindex(env: Env, requestUrl: string): Promise<boolean> {
  try {
    const settings = await getSiteSettings(env).catch(() => null);
    return !resolveIndexing({
      settings,
      publicNoindexVar: env.PUBLIC_NOINDEX,
      requestHost: new URL(requestUrl).host,
    });
  } catch {
    return true;
  }
}

class RuntimeSiteRewriter {
  constructor(
    private readonly origin: string,
    private readonly indexing: boolean,
    private readonly lang: string,
    private readonly siteName: string | null,
  ) {}
  element(el: Element): void {
    if (el.tagName === 'html') el.setAttribute('lang', this.lang);
    if (el.tagName === 'meta' && el.getAttribute('name')?.toLowerCase() === 'robots') {
      // Preserve page-level exclusions authored at build time.
      const content = robotsContentForRuntime(el.getAttribute('content'), this.indexing);
      if (content) el.setAttribute('content', content);
    }
    if (el.getAttribute('property')?.toLowerCase() === 'og:site_name' && this.siteName) {
      el.setAttribute('content', this.siteName);
    }
    if (el.getAttribute('property')?.toLowerCase() === 'og:locale') {
      el.setAttribute('content', this.lang === 'en' ? 'en_US' : 'th_TH');
    }
    for (const key of ['href', 'src', 'content', 'action', 'poster']) {
      let value = el.getAttribute(key);
      if (!value) continue;
      value = value.replaceAll('__MOSS_SITE_NAME__', this.siteName ?? 'Mossplan');
      value = value.replaceAll('https://moss-origin.invalid', this.origin);
      value = value.replaceAll(
        'contact@moss-origin.invalid',
        `contact@${new URL(this.origin).hostname}`,
      );
      el.setAttribute(key, value);
    }
  }
}

class RuntimeTextRewriter {
  private pending = '';

  constructor(
    private readonly origin: string,
    private readonly siteName: string | null = null,
    private readonly mode: 'html' | 'json' = 'html',
  ) {}
  text(text: Text): void {
    this.pending += text.text;
    if (!text.lastInTextNode) {
      text.remove();
      return;
    }
    const name = this.siteName ?? 'Mossplan';
    const escapedName =
      this.mode === 'json'
        ? JSON.stringify(name).slice(1, -1).replaceAll('<', '\\u003C')
        : escapeHtmlText(name);
    let value = this.pending.replaceAll(
      'https://moss-origin.invalid',
      this.mode === 'json' ? this.origin : escapeHtmlText(this.origin),
    );
    value = value.replaceAll(
      'contact@moss-origin.invalid',
      `contact@${new URL(this.origin).hostname}`,
    );
    value = value.replaceAll('__MOSS_SITE_NAME__', escapedName);
    this.pending = '';
    text.replace(value, { html: true });
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Creates a 301 Moved Permanently redirect response with Location and optional X-Robots-Tag.
 */
function createRedirectResponse(destination: string, applyNoindex: boolean): Response {
  const headers = new Headers({
    Location: destination,
  });
  if (applyNoindex) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return new Response(null, {
    status: 301,
    headers,
  });
}

function robotsHeader(response: Response, noindex: boolean): Response {
  const headers = new Headers(response.headers);
  if (noindex) headers.set('X-Robots-Tag', 'noindex, nofollow');
  else headers.delete('X-Robots-Tag');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      await ensureMigrationsOnce(env.DB);
    } catch {
      return new Response('Service unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const url = new URL(request.url);
    const { pathname } = url;

    const settings = await getSiteSettings(env).catch(() => null);
    const siteOrigin = runtimeOrigin(settings, request.url);
    // Canonical redirects use D1 when setup has supplied a site URL.
    const toCanonical = canonicalRedirect(settings?.site_url ?? undefined, request.url);
    if (toCanonical)
      return finalizeSecurity(
        robotsHeader(toCanonical, await shouldApplyNoindex(env, request.url)),
        request.url,
        env,
      );

    // 1. Static redirects (CONTRACTS §3, §7, D30).
    // Instant, in-memory single-hop 301s for /sitemap.xml and article/category/tag/author slug changes.
    const staticTarget = findMatchingRedirect(pathname, staticRedirects);
    if (staticTarget) {
      const applyNoindex = await shouldApplyNoindex(env, request.url);
      const targetUrl = url.search ? `${staticTarget}${url.search}` : staticTarget;
      return finalizeSecurity(createRedirectResponse(targetUrl, applyNoindex), request.url, env);
    }

    // Canonical article routes always include a trailing slash. Resolve only known article
    // destinations so API, static, and unknown routes keep their existing behavior.
    const articleSlashTarget = staticRedirects.find(
      (rule) => rule.from.startsWith('/articles/') && rule.to === `${pathname}/`,
    )?.to;
    if (articleSlashTarget) {
      const applyNoindex = await shouldApplyNoindex(env, request.url);
      const targetUrl = url.search ? `${articleSlashTarget}${url.search}` : articleSlashTarget;
      return finalizeSecurity(createRedirectResponse(targetUrl, applyNoindex), request.url, env);
    }

    // 2. `/api` goes straight to Hono, so slashless URLs such as `/api/admin/articles` work even though
    // Astro's `trailingSlash: 'always'` would 404 them. `src/pages/api/[...path].ts` still forwards the
    // slashed form for Astro's own router.
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return robotsHeader(
        await app.fetch(request, env, ctx),
        await shouldApplyNoindex(env, request.url),
      );
    }

    // 3. `/go/*` is the only public path served by the Worker (D22, AFFILIATE §3).
    if (pathname === '/go' || pathname.startsWith('/go/')) {
      const response = await goRoutes.fetch(request, env, ctx);
      return finalizeSecurity(
        robotsHeader(response, await shouldApplyNoindex(env, request.url)),
        request.url,
        env,
      );
    }

    // Pages are never revalidated with 304: their body carries a per-request nonce (see security.ts).
    // The Worker runs before the assets binding (run_worker_first), so even an internal cache HIT
    // passes through finalizeSecurity below and gets a fresh nonce.
    if (pathname === '/robots.txt') {
      const indexing = !(await shouldApplyNoindex(env, request.url));
      const body = indexing
        ? `# Search engines and AI search / user-triggered fetchers: allowed\nUser-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /go/\n\n# AI model training: not allowed\n${['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'Meta-ExternalAgent', 'CCBot', 'Bytespider'].map((bot) => `User-agent: ${bot}`).join('\n')}\nDisallow: /\n\nSitemap: ${siteOrigin}/sitemap-index.xml\n`
        : `User-agent: *\nDisallow: /\n\n${['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'Meta-ExternalAgent', 'CCBot', 'Bytespider'].map((bot) => `User-agent: ${bot}`).join('\n')}\nDisallow: /\n`;
      const headers = new Headers({ 'Content-Type': 'text/plain; charset=utf-8' });
      if (!indexing) headers.set('X-Robots-Tag', 'noindex, nofollow');
      return finalizeSecurity(new Response(body, { headers }), request.url, env);
    }

    const response = await astro.fetch(stripConditionalForPages(request), env, ctx);

    // Runtime noindex must also suppress the build-time llms documents when D1 indexing is off.
    const applyNoindex = await shouldApplyNoindex(env, request.url);
    if (applyNoindex && (pathname === '/llms.txt' || pathname === '/llms-full.txt')) {
      return finalizeSecurity(
        new Response(`# ${settings?.site_name ?? 'Mossplan'}\n`, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        }),
        request.url,
        env,
      );
    }

    // 4. If Astro 404s, check D1 redirect table for recent slug changes not yet in static build (CONTRACTS §3)
    if (response.status === 404 && env.DB) {
      try {
        const db = getDb(env);
        const dbTarget = await resolveRedirectFromDb(db, pathname);
        if (dbTarget) {
          const applyNoindex = await shouldApplyNoindex(env, request.url);
          const targetUrl = url.search ? `${dbTarget}${url.search}` : dbTarget;
          return finalizeSecurity(
            createRedirectResponse(targetUrl, applyNoindex),
            request.url,
            env,
          );
        }
      } catch {
        // Fall back to original 404 response if DB lookup fails
      }
    }

    // 5. Apply X-Robots-Tag: noindex, nofollow at request time when indexing is off
    let final = response;
    const headers = new Headers(response.headers);
    if (applyNoindex) headers.set('X-Robots-Tag', 'noindex, nofollow');
    else headers.delete('X-Robots-Tag');
    if (response.body) {
      final = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      const type = headers.get('Content-Type') ?? '';
      const site = settings;
      if (type.includes('text/html')) {
        const routeLang = pathname.match(/^\/(en|th)(?:\/|$)/)?.[1] ?? site?.default_lang ?? 'th';
        final = new HTMLRewriter()
          .on(
            '*',
            new RuntimeSiteRewriter(siteOrigin, !applyNoindex, routeLang, site?.site_name ?? null),
          )
          .on(
            'script[type="application/ld+json"]',
            new RuntimeTextRewriter(siteOrigin, site?.site_name ?? null, 'json'),
          )
          .on('title', new RuntimeTextRewriter(siteOrigin, site?.site_name ?? null))
          .on('body', new RuntimeTextRewriter(siteOrigin, site?.site_name ?? null))
          .transform(final);
      } else if (type.includes('xml') || type.startsWith('text/')) {
        const body = (await final.text())
          .replaceAll('https://moss-origin.invalid', siteOrigin)
          .replaceAll('__MOSS_SITE_NAME__', site?.site_name ?? 'Mossplan');
        final = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    // Final security pass: per-request CSP nonce on HTML, HSTS only on the custom domain (P2).
    return finalizeSecurity(final, request.url, env);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(controller.cron, env));
  },
} satisfies ExportedHandler<Env>;
