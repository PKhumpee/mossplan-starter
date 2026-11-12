import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { Env } from '../env';
import { isAllowedSiteProtocol } from '../../shared/site';
import { invalidateSiteSettings } from '../db/site-settings';
import type { AppEnv } from '../http/types';
import {
  clearGeneratedSecretCache,
  encryptValue,
  GENERATED_SECRET_NAMES,
  newGeneratedSecret,
} from '../services/secrets';
import { prepareSetupSettingsWrite } from '../services/settings';
import {
  constantTimeEqual,
  createSetupSession,
  incrementOtpAttempt,
  readSetupSession,
  saveSessionDraft,
  setupCompleted,
  sha256,
  type SetupDraft,
} from '../services/setup';

const COOKIE = 'moss_setup';
const OTP_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RESEND_TEST_FROM = 'onboarding@resend.dev';
const RESEND_API_URL = 'https://api.resend.com/emails';

function resendEndpoint(localOverride?: string): string {
  if (!localOverride) return RESEND_API_URL;
  try {
    const url = new URL(localOverride);
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return url.toString();
    }
  } catch {
    // Invalid overrides fall back to the official Resend endpoint.
  }
  return RESEND_API_URL;
}

const draftSchema = z.object({
  siteName: z.string().trim().min(1).max(120),
  siteUrl: z.string().trim().min(1).max(2048),
  defaultLang: z.enum(['th', 'en']),
  indexingEnabled: z.boolean().optional().default(false),
  resendApiKey: z.string().trim().min(1).max(512),
  emailFrom: z.string().trim().email().max(320).nullable(),
  turnstileSiteKey: z.string().trim().min(1).max(512),
  turnstileSecretKey: z.string().trim().min(1).max(512),
  adminEmail: z.string().trim().email().max(320),
});

const setupBody = z.object({ token: z.string().min(1).max(4096) });
const otpBody = z.object({ otp: z.string().regex(/^\d{6}$/) });

function errorResponse(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  fields?: string[],
) {
  return c.json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
}

async function setupIsComplete(env: Env): Promise<boolean> {
  try {
    return await setupCompleted(env);
  } catch {
    return false;
  }
}

async function validSession(env: Env, cookie: string | undefined) {
  if (!cookie) return null;
  return readSetupSession(env, cookie);
}

async function registerFailedAttempt(
  env: Env,
  ip: string,
): Promise<{ limited: boolean; retryAfter: number }> {
  const now = Date.now();
  const ipHash = await sha256(ip || 'unknown');
  await env.DB.prepare(
    `INSERT INTO setup_attempts (ip_hash, failed_count, window_started_at) VALUES (?, ?, ?)
     ON CONFLICT(ip_hash) DO UPDATE SET
       failed_count = CASE WHEN setup_attempts.window_started_at + ? <= excluded.window_started_at THEN 1 ELSE setup_attempts.failed_count + 1 END,
       window_started_at = CASE WHEN setup_attempts.window_started_at + ? <= excluded.window_started_at THEN excluded.window_started_at ELSE setup_attempts.window_started_at END`,
  )
    .bind(ipHash, 1, now, RATE_WINDOW_MS, RATE_WINDOW_MS)
    .run();
  const row = await env.DB.prepare(
    'SELECT failed_count, window_started_at FROM setup_attempts WHERE ip_hash = ?',
  )
    .bind(ipHash)
    .first<{ failed_count: number; window_started_at: number }>();
  const limited = (row?.failed_count ?? 0) > 5;
  return {
    limited,
    retryAfter: limited
      ? Math.max(1, Math.ceil(((row?.window_started_at ?? now) + RATE_WINDOW_MS - now) / 1000))
      : 0,
  };
}

async function getRateLimit(
  env: Env,
  ip: string,
): Promise<{ limited: boolean; retryAfter: number }> {
  const now = Date.now();
  const ipHash = await sha256(ip || 'unknown');
  const row = await env.DB.prepare(
    'SELECT failed_count, window_started_at FROM setup_attempts WHERE ip_hash = ?',
  )
    .bind(ipHash)
    .first<{ failed_count: number; window_started_at: number }>();
  const limited = Boolean(
    row && row.failed_count >= 5 && now - row.window_started_at < RATE_WINDOW_MS,
  );
  return {
    limited,
    retryAfter: limited
      ? Math.max(1, Math.ceil((row!.window_started_at + RATE_WINDOW_MS - now) / 1000))
      : 0,
  };
}

async function sendOtp(draft: SetupDraft, otp: string, endpoint?: string): Promise<boolean> {
  const response = await fetch(resendEndpoint(endpoint), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${draft.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: draft.emailFrom ?? RESEND_TEST_FROM,
      to: [draft.adminEmail],
      subject: 'Mossplan setup verification code',
      text: `Your Mossplan verification code is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your Mossplan verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    }),
  });
  return response.ok;
}

export const setupRoutes = new Hono<AppEnv>()
  .get('/setup/status', async (c) => {
    try {
      return c.json({ completed: await setupCompleted(c.env) });
    } catch {
      return c.json({ completed: false });
    }
  })
  .post('/setup/verify', async (c) => {
    if (await setupIsComplete(c.env)) return c.notFound();
    if (!c.env.SETUP_TOKEN || !c.env.MOSS_SECRET_KEY) {
      return errorResponse(c, 503, 'setup_unavailable', 'Setup is unavailable');
    }

    const body = await c.req.json().catch(() => null);
    const parsed = setupBody.safeParse(body);
    const suppliedHash = await sha256(parsed.success ? parsed.data.token : '');
    const expectedHash = await sha256(c.env.SETUP_TOKEN);
    const valid = parsed.success && constantTimeEqual(suppliedHash, expectedHash);
    const remoteIp = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const currentLimit = await getRateLimit(c.env, remoteIp);
    if (currentLimit.limited) {
      c.header('Retry-After', String(currentLimit.retryAfter));
      return errorResponse(c, 429, 'rate_limited', 'Too many attempts');
    }
    if (!valid) {
      const attempt = await registerFailedAttempt(c.env, remoteIp);
      if (attempt.limited) {
        c.header('Retry-After', String(attempt.retryAfter));
        return errorResponse(c, 429, 'rate_limited', 'Too many attempts');
      }
      return errorResponse(c, 401, 'invalid_token', 'Invalid setup token');
    }

    const tokenHash = await sha256(c.env.SETUP_TOKEN);
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO setup_state (id, token_hash, consumed_at) VALUES (1, ?, NULL)',
    )
      .bind(tokenHash)
      .run();
    await c.env.DB.prepare(
      'UPDATE setup_state SET token_hash = ? WHERE id = 1 AND consumed_at IS NULL',
    )
      .bind(tokenHash)
      .run();
    const state = await c.env.DB.prepare(
      'SELECT token_hash, consumed_at FROM setup_state WHERE id = 1',
    ).first<{ token_hash: string; consumed_at: number | null }>();
    if (!state || !constantTimeEqual(state.token_hash, expectedHash) || state.consumed_at != null) {
      return c.notFound();
    }

    const session = await createSetupSession(c.env);
    setCookie(c, COOKIE, session.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/api/setup',
      maxAge: 1800,
    });
    return c.json({ ok: true });
  })
  .post('/setup/submit', async (c) => {
    if (await setupIsComplete(c.env)) return c.notFound();
    const session = await validSession(c.env, getCookie(c, COOKIE));
    if (!session) return errorResponse(c, 401, 'no_session', 'Setup session is missing or expired');

    const body = await c.req.json().catch(() => null);
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      const fields = [
        ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'body'))),
      ];
      return errorResponse(c, 400, 'invalid_input', 'Setup details are invalid', fields);
    }
    const data = parsed.data;
    const fields: string[] = [];
    try {
      const url = new URL(data.siteUrl);
      if (
        !isAllowedSiteProtocol(url) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      ) {
        fields.push('siteUrl');
      }
    } catch {
      fields.push('siteUrl');
    }
    if (fields.length)
      return errorResponse(c, 400, 'invalid_input', 'Setup details are invalid', [
        ...new Set(fields),
      ]);

    const draft: SetupDraft = {
      ...data,
      siteUrl: new URL(data.siteUrl).origin,
      adminEmail: data.adminEmail.toLowerCase(),
      emailFrom: data.emailFrom?.toLowerCase() ?? null,
      otp: String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, '0'),
    };
    try {
      const sent = await sendOtp(draft, draft.otp, c.env.RESEND_API_URL);
      if (!sent)
        return errorResponse(
          c,
          502,
          'resend_failed',
          'Resend could not send the verification code',
        );
    } catch {
      return errorResponse(c, 502, 'resend_failed', 'Resend could not send the verification code');
    }
    await saveSessionDraft(c.env, session.sessionHash, draft, Date.now() + OTP_TTL_MS);
    return c.json({ otpSent: true, testSender: draft.emailFrom === null });
  })
  .post('/setup/confirm', async (c) => {
    if (await setupIsComplete(c.env)) return c.notFound();
    const cookie = getCookie(c, COOKIE);
    const session = await validSession(c.env, cookie);
    if (!session) return errorResponse(c, 401, 'no_session', 'Setup session is missing or expired');

    const body = await c.req.json().catch(() => null);
    const parsed = otpBody.safeParse(body);
    const expectedOtp = session.draft.otp;
    const otpValid =
      parsed.success && Boolean(expectedOtp) && constantTimeEqual(parsed.data.otp, expectedOtp!);
    if (!otpValid || !session.otpExpiresAt || session.otpExpiresAt <= Date.now()) {
      const attempts = await incrementOtpAttempt(c.env, session.sessionHash);
      if (attempts >= 5)
        await c.env.DB.prepare('DELETE FROM setup_sessions WHERE session_hash = ?')
          .bind(session.sessionHash)
          .run();
      return errorResponse(c, 401, 'invalid_otp', 'Verification code is invalid or expired');
    }

    if (!c.env.MOSS_SECRET_KEY)
      return errorResponse(c, 503, 'setup_unavailable', 'Setup is unavailable');
    const draft = session.draft;
    const now = Date.now();
    const consumeNonce = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const resendSecret = await encryptValue(c.env.MOSS_SECRET_KEY, draft.resendApiKey);
    const turnstileSecret = await encryptValue(c.env.MOSS_SECRET_KEY, draft.turnstileSecretKey);
    const masterKey = c.env.MOSS_SECRET_KEY;
    const generatedSecrets = await Promise.all(
      GENERATED_SECRET_NAMES.map(async (name) => ({
        name,
        ...(await encryptValue(masterKey, newGeneratedSecret())),
      })),
    );
    const [claim] = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE setup_state SET consumed_at = ? WHERE id = 1 AND consumed_at IS NULL
         AND EXISTS (SELECT 1 FROM setup_sessions WHERE session_hash = ? AND expires_at > ? AND otp_expires_at > ? AND attempts < 5)`,
      ).bind(consumeNonce, session.sessionHash, now, now),
      ...prepareSetupSettingsWrite(c.env.DB, draft, now, consumeNonce),
      c.env.DB.prepare(
        `INSERT INTO secrets (name, iv, ciphertext, updated_at)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)
         ON CONFLICT(name) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
      ).bind('RESEND_API_KEY', resendSecret.iv, resendSecret.ciphertext, now, consumeNonce),
      c.env.DB.prepare(
        `INSERT INTO secrets (name, iv, ciphertext, updated_at)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)
         ON CONFLICT(name) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
      ).bind(
        'TURNSTILE_SECRET_KEY',
        turnstileSecret.iv,
        turnstileSecret.ciphertext,
        now,
        consumeNonce,
      ),
      ...generatedSecrets.map((secret) =>
        c.env.DB.prepare(
          `INSERT INTO secrets (name, iv, ciphertext, updated_at)
         SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)
         ON CONFLICT(name) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
        ).bind(secret.name, secret.iv, secret.ciphertext, now, consumeNonce),
      ),
      c.env.DB.prepare(
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role)
         SELECT ?, ?, ?, 1, ?, ?, 'owner' WHERE EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)`,
      ).bind(userId, draft.siteName, draft.adminEmail, now, now, consumeNonce),
      c.env.DB.prepare(
        'DELETE FROM setup_sessions WHERE session_hash = ? AND EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)',
      ).bind(session.sessionHash, consumeNonce),
    ]);

    if (claim?.meta.changes !== 1) return c.notFound();
    invalidateSiteSettings(c.env.DB);
    clearGeneratedSecretCache(c.env.DB);
    deleteCookie(c, COOKIE, {
      path: '/api/setup',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
    });
    return c.json({ completed: true, redirect: '/admin' });
  });
