import type { Env } from '../env';
import { decryptValue, encryptValue } from './secrets';

export const SETUP_SESSION_TTL_MS = 30 * 60 * 1000;
const encoder = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

export interface SetupDraft {
  siteName: string;
  siteUrl: string;
  defaultLang: 'th' | 'en';
  indexingEnabled: boolean;
  resendApiKey: string;
  emailFrom: string | null;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  adminEmail: string;
  otp: string;
}

export async function createSetupSession(
  env: Pick<Env, 'DB' | 'MOSS_SECRET_KEY'>,
): Promise<{ id: string; expiresAt: number }> {
  if (!env.MOSS_SECRET_KEY) throw new Error('Setup encryption is unavailable');
  const id = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const sessionHash = await sha256(id);
  const expiresAt = Date.now() + SETUP_SESSION_TTL_MS;
  const encrypted = await encryptValue(env.MOSS_SECRET_KEY, JSON.stringify({}));
  await env.DB.prepare(
    'INSERT INTO setup_sessions (session_hash, iv, ciphertext, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(sessionHash, encrypted.iv, encrypted.ciphertext, expiresAt)
    .run();
  return { id, expiresAt };
}

export async function readSetupSession(
  env: Pick<Env, 'DB' | 'MOSS_SECRET_KEY'>,
  id: string,
): Promise<{
  sessionHash: string;
  draft: SetupDraft;
  expiresAt: number;
  otpExpiresAt: number | null;
  attempts: number;
} | null> {
  if (!env.MOSS_SECRET_KEY) return null;
  const sessionHash = await sha256(id);
  const row = await env.DB.prepare(
    'SELECT iv, ciphertext, expires_at, otp_expires_at, attempts FROM setup_sessions WHERE session_hash = ?',
  )
    .bind(sessionHash)
    .first<{
      iv: string;
      ciphertext: string;
      expires_at: number;
      otp_expires_at: number | null;
      attempts: number;
    }>();
  if (!row || row.expires_at <= Date.now()) {
    if (row)
      await env.DB.prepare('DELETE FROM setup_sessions WHERE session_hash = ?')
        .bind(sessionHash)
        .run();
    return null;
  }
  try {
    const draft = JSON.parse(
      await decryptValue(env.MOSS_SECRET_KEY, row.iv, row.ciphertext),
    ) as SetupDraft;
    return {
      sessionHash,
      draft,
      expiresAt: row.expires_at,
      otpExpiresAt: row.otp_expires_at,
      attempts: row.attempts,
    };
  } catch {
    await env.DB.prepare('DELETE FROM setup_sessions WHERE session_hash = ?')
      .bind(sessionHash)
      .run();
    return null;
  }
}

export async function saveSessionDraft(
  env: Pick<Env, 'DB' | 'MOSS_SECRET_KEY'>,
  sessionHash: string,
  draft: SetupDraft,
  otpExpiresAt: number,
): Promise<void> {
  if (!env.MOSS_SECRET_KEY) throw new Error('Setup encryption is unavailable');
  const encrypted = await encryptValue(env.MOSS_SECRET_KEY, JSON.stringify(draft));
  await env.DB.prepare(
    'UPDATE setup_sessions SET iv = ?, ciphertext = ?, otp_expires_at = ?, attempts = 0 WHERE session_hash = ? AND expires_at > ?',
  )
    .bind(encrypted.iv, encrypted.ciphertext, otpExpiresAt, sessionHash, Date.now())
    .run();
}

export async function incrementOtpAttempt(
  env: Pick<Env, 'DB'>,
  sessionHash: string,
): Promise<number> {
  await env.DB.prepare('UPDATE setup_sessions SET attempts = attempts + 1 WHERE session_hash = ?')
    .bind(sessionHash)
    .run();
  const row = await env.DB.prepare('SELECT attempts FROM setup_sessions WHERE session_hash = ?')
    .bind(sessionHash)
    .first<{ attempts: number }>();
  return row?.attempts ?? 5;
}

export async function setupCompleted(env: Pick<Env, 'DB'>): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT setup_completed_at FROM site_settings WHERE id = 1',
  ).first<{ setup_completed_at: number | null }>();
  return row?.setup_completed_at != null;
}
