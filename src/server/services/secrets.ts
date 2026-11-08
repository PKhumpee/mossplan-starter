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
  name: 'RESEND_API_KEY' | 'TURNSTILE_SECRET_KEY',
): Promise<string | null> {
  const configured = env[name];
  return configured?.trim() ? configured : getSecret(env, name);
}

export { fromBase64, toBase64 };
