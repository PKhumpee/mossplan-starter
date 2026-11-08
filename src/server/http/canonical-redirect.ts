// Canonical host + scheme redirects (P0-canonical-redirects).
// When SITE_URL is a real domain, every request whose host is not the SITE_URL host (e.g. *.workers.dev,
// www.<host>) and every plain-http request answers one 301 to the same path and query on SITE_URL.
// Skipped when SITE_URL is unset/invalid/workers.dev, and for local dev hosts.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function isLocal(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

/** Returns a 301 to the canonical SITE_URL origin when host or scheme differ, else null. */
export function canonicalRedirect(
  siteUrl: string | undefined,
  requestUrl: string,
): Response | null {
  if (!siteUrl) return null;
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    return null;
  }
  if (
    site.protocol !== 'https:' ||
    site.hostname.endsWith('.workers.dev') ||
    isLocal(site.hostname)
  ) {
    return null;
  }
  const url = new URL(requestUrl);
  if (isLocal(url.hostname)) return null;
  if (url.host === site.host && url.protocol === 'https:') return null;
  return new Response(null, {
    status: 301,
    headers: { Location: `${site.origin}${url.pathname}${url.search}` },
  });
}
