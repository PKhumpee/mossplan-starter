// Live check (P2 security headers): fires consecutive requests at each page, including a revalidation
// with If-None-Match, and asserts every response has a fresh nonce that matches its own CSP header and
// is not cacheable. Usage: tsx scripts/check-csp-nonce.ts [baseUrl]  (default http://localhost:8787)
const base = process.argv[2] ?? 'http://localhost:8787';
const paths = ['/', '/search/', '/admin/login/'];
let failed = false;

function fail(msg: string): void {
  failed = true;
  console.error(`[check:csp-nonce] FAIL ${msg}`);
}

for (const path of paths) {
  const seen = new Set<string>();
  for (const etag of [undefined, '*', undefined]) {
    const res = await fetch(base + path, {
      headers: etag ? { 'If-None-Match': etag } : {},
      redirect: 'manual',
    });
    const csp = res.headers.get('content-security-policy') ?? '';
    const headerNonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const body = await res.text();
    const htmlNonces = new Set(
      [...body.matchAll(/<(?:script|style)[^>]*\snonce="([^"]+)"/g)].map((m) => m[1]),
    );
    const tag = `${path} (${etag ? 'If-None-Match' : 'plain'}, status ${res.status}, cf-cache-status ${res.headers.get('cf-cache-status') ?? '-'})`;
    if (res.status !== 200) fail(`${tag}: expected 200`);
    if (!headerNonce) fail(`${tag}: no nonce in CSP`);
    else {
      if (seen.has(headerNonce)) fail(`${tag}: nonce reused`);
      seen.add(headerNonce);
      if (htmlNonces.size !== 1 || !htmlNonces.has(headerNonce)) {
        fail(`${tag}: HTML nonces ${[...htmlNonces].join(',')} != header ${headerNonce}`);
      }
    }
    if (!/no-store/.test(res.headers.get('cache-control') ?? '')) fail(`${tag}: cacheable`);
    if (!failed) console.log(`[check:csp-nonce] ok ${tag} nonce=${headerNonce}`);
  }
}
if (failed) process.exit(1);
console.log('[check:csp-nonce] all pages: fresh nonce per request, HTML matches header, no-store');
export {};
