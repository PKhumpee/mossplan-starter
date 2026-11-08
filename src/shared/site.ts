// Single source of truth for the site's origin and addresses (CONTRACTS §2a, D36, D37).
// Workers-safe: no Node APIs. The Worker passes `env`; the build passes `readSiteConfig()`.

export interface SiteInput {
  SITE_URL: string;
  PUBLIC_NOINDEX: string;
  /** Optional sender override (e.g. a verified Resend sender while the domain is unverified). */
  EMAIL_FROM?: string;
}

export interface Site {
  /** Origin without a trailing slash, e.g. `https://example.com`. */
  url: string;
  origin: string;
  host: string;
  /** True on `*.workers.dev`. */
  isPreview: boolean;
  /** The "ไม่ให้ Search engine เก็บเว็บเข้า index" switch. */
  noindex: boolean;
  /** Absolute URL for a site-relative path (`/articles/x/` → `https://host/articles/x/`). */
  absolute(path: string): string;
  emailFrom: string;
  contactEmail: string;
  securityEmail: string;
}

/** Resend's shared test sender, the only one usable before a domain is verified. */
export const PREVIEW_EMAIL_FROM = 'onboarding@resend.dev';

/** HTTPS everywhere; HTTP is allowed only for local loopback development. */
export function isAllowedSiteProtocol(url: URL): boolean {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
}

export function siteFrom(input: SiteInput): Site {
  const { SITE_URL, PUBLIC_NOINDEX, EMAIL_FROM } = input;

  if (PUBLIC_NOINDEX !== 'true' && PUBLIC_NOINDEX !== 'false') {
    throw new Error(
      `PUBLIC_NOINDEX must be "true" or "false", got ${JSON.stringify(PUBLIC_NOINDEX)}`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(SITE_URL);
  } catch {
    throw new Error(`SITE_URL must be a valid origin, got ${JSON.stringify(SITE_URL)}`);
  }
  if (!isAllowedSiteProtocol(parsed)) {
    throw new Error(
      `SITE_URL must use https (http is allowed only for loopback hosts), got ${JSON.stringify(SITE_URL)}`,
    );
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error(`SITE_URL must be an origin without a path, got ${JSON.stringify(SITE_URL)}`);
  }

  const origin = parsed.origin;
  const host = parsed.host;
  const isPreview = host.endsWith('.workers.dev');

  return {
    url: origin,
    origin,
    host,
    isPreview,
    noindex: PUBLIC_NOINDEX === 'true',
    absolute(path: string): string {
      return new URL(path.startsWith('/') ? path : `/${path}`, origin).toString();
    },
    emailFrom: EMAIL_FROM?.trim() || (isPreview ? PREVIEW_EMAIL_FROM : `noreply@${host}`),
    contactEmail: `contact@${host}`,
    securityEmail: `security@${host}`,
  };
}

/**
 * For pages and components at build time. `__SITE_CONFIG__` is injected by `astro.config.ts` through
 * Vite `define`, because prerendering may run inside workerd where `wrangler.jsonc` cannot be read.
 */
export function buildSite(): Site {
  return siteFrom(__SITE_CONFIG__);
}
