// Cloudflare Access Zero Trust JWT verification (D34, CONTRACTS §2, §4).
// Uses WebCrypto (crypto.subtle) only: safe for workerd. Caches JWKS in memory.

interface JwkKey {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface JwtHeader {
  kid: string;
  alg: string;
  typ: string;
}

interface JwtPayload {
  aud: string | string[];
  email: string;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  identity_nonce?: string;
}

const keyCache = new Map<string, { key: CryptoKey; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseJsonPayload<T>(base64Url: string): T | null {
  try {
    const bytes = base64UrlDecode(base64Url);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function getPublicKey(teamDomain: string, kid: string): Promise<CryptoKey | null> {
  const cacheKey = `${teamDomain}:${kid}`;
  const cached = keyCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.key;
  }

  try {
    const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`;
    const res = await fetch(certsUrl);
    if (!res.ok) return null;
    const jwks = (await res.json()) as JwksResponse;

    for (const jwk of jwks.keys) {
      if (jwk.kty === 'RSA' && jwk.alg === 'RS256') {
        const cryptoKey = await crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        );
        keyCache.set(`${teamDomain}:${jwk.kid}`, { key: cryptoKey, fetchedAt: Date.now() });
      }
    }

    return keyCache.get(cacheKey)?.key ?? null;
  } catch (err) {
    console.error('[access] failed to fetch or parse certs from', teamDomain, err);
    return null;
  }
}

/**
 * Validates a Cloudflare Access assertion token.
 * Returns the payload if valid, or null if invalid or expired.
 */
export async function verifyAccessJwt(
  assertion: string | null | undefined,
  teamDomain: string,
  expectedAud: string,
): Promise<JwtPayload | null> {
  if (!assertion) return null;

  const parts = assertion.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = parseJsonPayload<JwtHeader>(headerB64!);
  const payload = parseJsonPayload<JwtPayload>(payloadB64!);

  if (!header || !payload || header.alg !== 'RS256' || !header.kid) {
    return null;
  }

  // 1. Verify Audience
  const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audArray.includes(expectedAud)) {
    return null;
  }

  // 2. Verify Issuer
  const expectedIss = `https://${teamDomain}`;
  if (payload.iss !== expectedIss) {
    return null;
  }

  // 3. Verify Expiry
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) {
    return null;
  }

  // 4. Verify Signature with CryptoKey
  const key = await getPublicKey(teamDomain, header.kid);
  if (!key) return null;

  const encoder = new TextEncoder();
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  let signature: Uint8Array;
  try {
    signature = base64UrlDecode(signatureB64!);
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature as BufferSource,
    data as BufferSource,
  );

  return valid ? payload : null;
}
