import type { Env } from '../env';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toOwnedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function getKey(value: string): Promise<CryptoKey> {
  const bytes = fromBase64(value);
  if (bytes.byteLength !== 32) throw new Error('MOSS_SECRET_KEY must be 32 bytes');
  return crypto.subtle.importKey('raw', toOwnedBuffer(bytes), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptValue(keyValue: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(keyValue);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptValue(keyValue: string, iv: string, ciphertext: string) {
  const key = await getKey(keyValue);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toOwnedBuffer(fromBase64(iv)) },
    key,
    toOwnedBuffer(fromBase64(ciphertext)),
  );
  return new TextDecoder().decode(plaintext);
}

export async function saveSecret(
  env: Pick<Env, 'DB' | 'MOSS_SECRET_KEY'>,
  name: string,
  value: string,
  updatedAt = Date.now(),
): Promise<{ iv: string; ciphertext: string }> {
  if (!env.MOSS_SECRET_KEY) throw new Error('Setup encryption is unavailable');
  const encrypted = await encryptValue(env.MOSS_SECRET_KEY, value);
  await env.DB.prepare(
    `INSERT INTO secrets (name, iv, ciphertext, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
  )
    .bind(name, encrypted.iv, encrypted.ciphertext, updatedAt)
    .run();
  return encrypted;
}

export async function getSecret(
  env: Pick<Env, 'DB' | 'MOSS_SECRET_KEY'>,
  name: string,
): Promise<string | null> {
  const row = await env.DB.prepare('SELECT iv, ciphertext FROM secrets WHERE name = ?')
    .bind(name)
    .first<{ iv: string; ciphertext: string }>();
  if (!row) return null;
  if (!env.MOSS_SECRET_KEY) throw new Error('Setup encryption is unavailable');
  return decryptValue(env.MOSS_SECRET_KEY, row.iv, row.ciphertext);
}

/** Worker-provided secrets take precedence over encrypted runtime values (D-005). */
export async function resolveSecret(
  env: Env,
  name:
    'RESEND_API_KEY' | 'TURNSTILE_SECRET_KEY' | 'BUILD_CALLBACK_TOKEN' | 'BUILD_DEPLOY_HOOK_URL',
): Promise<string | null> {
  const configured = env[name];
  return configured?.trim() ? configured : getSecret(env, name);
}

/** Secrets the customer never sees: generated once at setup and stored encrypted. */
export const GENERATED_SECRET_NAMES = [
  'BETTER_AUTH_SECRET',
  'CLICK_HASH_SECRET',
  'BUILD_CALLBACK_TOKEN',
] as const;
export type GeneratedSecretName = (typeof GENERATED_SECRET_NAMES)[number];

const storedGenerated = new WeakMap<D1Database, Map<GeneratedSecretName, string>>();
const isolateFallback = new Map<GeneratedSecretName, string>();

export function newGeneratedSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function clearGeneratedSecretCache(db: D1Database): void {
  storedGenerated.delete(db);
}

/**
 * Resolves a generated secret: Worker secret first (D-005), then the stored value. Before setup, or
 * if the stored value cannot be read, it falls back to a random value private to this isolate, so
 * there is never a shared default. Only stored values are cached, so setup takes effect at once.
 */
export async function resolveGeneratedSecret(env: Env, name: GeneratedSecretName): Promise<string> {
  const configured = env[name];
  if (configured?.trim()) return configured;

  const cached = storedGenerated.get(env.DB)?.get(name);
  if (cached) return cached;

  try {
    const stored = await getSecret(env, name);
    if (stored) {
      let values = storedGenerated.get(env.DB);
      if (!values) {
        values = new Map();
        storedGenerated.set(env.DB, values);
      }
      values.set(name, stored);
      return stored;
    }
  } catch {
    console.error('[secrets] could not read generated secret', name);
  }

  let fallback = isolateFallback.get(name);
  if (!fallback) {
    fallback = newGeneratedSecret();
    isolateFallback.set(name, fallback);
  }
  return fallback;
}

export { fromBase64, toBase64 };
