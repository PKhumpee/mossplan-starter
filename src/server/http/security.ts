// Security headers helper & Hono middleware (CONTRACTS §1, T17, P2 security headers).
// Sets CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, and HSTS.
//
// CSP (P2): script-src no longer allows 'unsafe-inline'. Every HTML response from the Worker gets a
// fresh per-request nonce (`withCspNonce`), which HTMLRewriter stamps onto every <script> and <style>.
// 'strict-dynamic' lets nonced scripts load their own chunks (Astro islands, Vue admin, Turnstile).
// 'self' / https: / 'unsafe-inline' after it are ignored by CSP3 browsers and only act as a fallback
// for very old browsers (the classic strict-CSP pattern).
//
// HSTS (P2): max-age=31536000; includeSubDomains, sent ONLY on the real custom domain (the host of
// SITE_URL, never *.workers.dev / localhost). `preload` is intentionally not set yet.
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './types';

export const HSTS_DEFAULT_MAX_AGE = 31536000;

type CspKind = 'public' | 'admin';

function scriptSrc(nonce: string | undefined, extraHosts: string): string {
  if (!nonce) return `script-src 'self' ${extraHosts}`;
  return `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' https: ${extraHosts}`;
}

/** Builds the CSP for an HTML page. Without a nonce, inline scripts are simply not allowed. */
export function buildCsp(kind: CspKind, nonce?: string): string {
  const admin = kind === 'admin';
  // style-src keeps 'unsafe-inline': Vue/Tiptap/ProseMirror and Turnstile write inline style
  // attributes and inject <style> elements at runtime that cannot carry a nonce. Inline styles cannot
  // execute script, so this is the accepted trade-off (see docs/ops/security.md).
  return [
    "default-src 'self'",
    scriptSrc(
      nonce,
      admin
        ? 'https://challenges.cloudflare.com https://static.cloudflareinsights.com'
        : 'https://static.cloudflareinsights.com',
    ),
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    admin
      ? 'frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com'
      : 'frame-src https://www.youtube-nocookie.com',
    admin
      ? "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com"
      : "connect-src 'self' https://cloudflareinsights.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Static fallbacks (no nonce): used for non-HTML responses where no inline script can exist. */
export const ADMIN_CSP = buildCsp('admin');
export const STATIC_CSP = buildCsp('public');
/** JSON / redirect responses from /api and /go never render content. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

export interface HstsConfig {
  SITE_URL?: string;
  HSTS_MAX_AGE?: string;
}

/**
 * Returns the HSTS value for this request, or null when HSTS must not be sent.
 * Sent only over https on the custom domain from SITE_URL (and its subdomains), never on
 * *.workers.dev or localhost. HSTS_MAX_AGE (optional var) overrides the 1-year default; "0" disables.
 */
export function hstsFor(requestUrl: string, env: HstsConfig = {}): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') return null;
  if (host.endsWith('.workers.dev') || host === 'localhost' || host.endsWith('.localhost')) {
    return null;
  }
  let siteHost: string | null = null;
  try {
    siteHost = env.SITE_URL ? new URL(env.SITE_URL).hostname.toLowerCase() : null;
  } catch {
    siteHost = null;
  }
  if (!siteHost || siteHost.endsWith('.workers.dev')) return null;
  if (host !== siteHost && !host.endsWith(`.${siteHost}`)) return null;

  const parsed = env.HSTS_MAX_AGE ? Number.parseInt(env.HSTS_MAX_AGE, 10) : HSTS_DEFAULT_MAX_AGE;
  const maxAge = Number.isFinite(parsed) && parsed >= 0 ? parsed : HSTS_DEFAULT_MAX_AGE;
  if (maxAge === 0) return null;
  return `max-age=${maxAge}; includeSubDomains`;
}

export interface SecurityOptions {
  isAdmin?: boolean;
  /** Full request URL; needed to decide HSTS. */
  requestUrl?: string;
  env?: HstsConfig;
  /** Per-request nonce for HTML responses. */
  nonce?: string;
  /** Override the CSP entirely (e.g. API_CSP). */
  csp?: string;
}

export function applySecurityHeaders(headers: Headers, options: SecurityOptions = {}): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  const hsts = options.requestUrl ? hstsFor(options.requestUrl, options.env) : null;
  if (hsts) headers.set('Strict-Transport-Security', hsts);
  else headers.delete('Strict-Transport-Security');
  headers.set(
    'Content-Security-Policy',
    options.csp ?? buildCsp(options.isAdmin ? 'admin' : 'public', options.nonce),
  );
}

/** 128-bit random nonce, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

class NonceHandler {
  constructor(private readonly nonce: string) {}
  element(el: Element): void {
    el.setAttribute('nonce', this.nonce);
  }
}

/**
 * Final header pass for every page/asset response from the Worker. HTML gets a fresh nonce on every
 * <script>/<style> plus a matching CSP; other responses get the nonce-less CSP. Also forbids caching
 * transforms that would reuse a nonce (no-transform is left to Cloudflare defaults).
 */
export function finalizeSecurity(
  response: Response,
  requestUrl: string,
  env: HstsConfig,
): Response {
  const { pathname } = new URL(requestUrl);
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const contentType = response.headers.get('Content-Type') ?? '';
  const isHtml = contentType.includes('text/html');
  const headers = new Headers(response.headers);

  if (!isHtml || response.body === null) {
    applySecurityHeaders(headers, { isAdmin, requestUrl, env });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const nonce = createNonce();
  applySecurityHeaders(headers, { isAdmin, requestUrl, env, nonce });
  // A nonced page must never be stored by any cache (browser, Cloudflare, caches.default): a cached body
  // would carry an old nonce. no-store also stops 304 revalidation (validators removed).
  headers.set('Cache-Control', 'private, no-store');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  const out = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  const handler = new NonceHandler(nonce);
  return new HTMLRewriter().on('script', handler).on('style', handler).transform(out);
}

/** True for page-like paths (HTML documents), as opposed to hashed assets under /_astro etc. */
export function isPagePath(pathname: string): boolean {
  if (pathname.endsWith('/') || pathname.endsWith('.html')) return true;
  const last = pathname.split('/').pop() ?? '';
  return !last.includes('.');
}

/**
 * Drops conditional headers on page requests so the assets binding never answers 304 for HTML; a 304
 * would make the browser reuse an old body (old nonce) with a new CSP header.
 */
export function stripConditionalForPages(request: Request): Request {
  const { pathname } = new URL(request.url);
  if (!isPagePath(pathname)) return request;
  if (!request.headers.has('If-None-Match') && !request.headers.has('If-Modified-Since')) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  return new Request(request, { headers });
}

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers, {
    isAdmin: true,
    requestUrl: c.req.url,
    env: c.env,
    csp: API_CSP,
  });
};
