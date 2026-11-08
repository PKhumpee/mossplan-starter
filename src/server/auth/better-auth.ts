// Better Auth configuration on Cloudflare Workers + D1 + Drizzle (CONTRACTS §4, D5).
// Email OTP only, invite allowlist, Turnstile captcha on OTP send, 7-day sliding session cookies.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { eq, like } from 'drizzle-orm';
import { PREVIEW_EMAIL_FROM } from '../../shared/site';
import type { Env } from '../env';
import { recordAudit } from '../db/audit';
import { getDb } from '../db/client';
import { getSiteSettings, runtimeOrigin } from '../db/site-settings';
import { getSetting } from '../db/settings';
import { resolveGeneratedSecret, resolveSecret } from '../services/secrets';
import * as schema from '../db/schema';

// Export schema map covering both camelCase and snake_case for Better Auth adapter
const authSchema = {
  ...schema,
  rate_limit: schema.rateLimit,
};

/** Verifies a Turnstile captcha token against Cloudflare's siteverify endpoint. */
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string,
): Promise<boolean> {
  if (!token || !secretKey) return false;

  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (remoteIp) formData.append('remoteip', remoteIp);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/** Sends an OTP email via Resend API HTTP fetch (no external SDK required). */
async function sendOtpEmail(options: {
  apiKey: string;
  from: string;
  to: string;
  otp: string;
}): Promise<boolean> {
  const { apiKey, from, to, otp } = options;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `รหัสยืนยันเข้าสู่ระบบ: ${otp}`,
        text: `รหัสยืนยัน 6 หลักสำหรับการเข้าสู่ระบบคือ: ${otp}\n\nรหัสนี้จะหมดอายุภายใน 5 นาที หากคุณไม่ได้ส่งคำขอนี้ สามารถเพิกเฉยต่ออีเมลนี้ได้`,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[auth] failed to send email via Resend:', err);
    return false;
  }
}

export function createAuth(env: Env, baseURL: string, secret: string) {
  const db = getDb(env);

  return betterAuth({
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
      usePlural: false,
    }),
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
      },
    },
    // User profile fields (D25) are declared input: false so client auth endpoints cannot write them
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: true,
          defaultValue: 'editor',
          input: false,
        },
        slug: { type: 'string', required: false, input: false },
        jobTitle: { type: 'string', required: false, input: false },
        bio: { type: 'string', required: false, input: false },
        avatarMediaId: { type: 'string', required: false, input: false },
        sameAsJson: { type: 'string', required: false, defaultValue: '[]', input: false },
        knowsAboutJson: { type: 'string', required: false, defaultValue: '[]', input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day sliding
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes cache to save D1 reads
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (userData) => {
            const email = userData.email.toLowerCase().trim();
            // Look up invite to assign role
            const [inv] = await db
              .select({ role: schema.invite.role })
              .from(schema.invite)
              .where(eq(schema.invite.email, email))
              .limit(1);

            return {
              data: {
                ...userData,
                email,
                role: inv ? inv.role : 'editor',
              },
            };
          },
          after: async (newUser) => {
            const email = newUser.email.toLowerCase().trim();
            // Mark invite as accepted
            await db
              .update(schema.invite)
              .set({ acceptedAt: Date.now() })
              .where(eq(schema.invite.email, email));

            await recordAudit(db, {
              actorId: newUser.id,
              action: 'team.first_login',
              targetType: 'user',
              targetId: newUser.id,
              meta: { role: newUser.role },
            });
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300, // 5 minutes
        allowedAttempts: 3,
        async sendVerificationOTP({ email, otp }, request) {
          const normalized = email.toLowerCase().trim();

          // 1. Account enumeration protection (CONTRACTS §4):
          // Check if email has an invite or an existing user row. If neither, return silently.
          const [existingUser] = await db
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(eq(schema.user.email, normalized))
            .limit(1);

          const [pendingInvite] = existingUser
            ? [null]
            : await db
                .select({ id: schema.invite.id })
                .from(schema.invite)
                .where(eq(schema.invite.email, normalized))
                .limit(1);

          if (!existingUser && !pendingInvite) {
            // Silently ignore unregistered emails and clean up any internal verification record
            await db
              .delete(schema.verification)
              .where(like(schema.verification.identifier, `%${normalized}%`));
            return;
          }

          // 2. Turnstile verification (if configured)
          const turnstileSecret = await resolveSecret(env, 'TURNSTILE_SECRET_KEY');
          const requestHeaders = request?.headers;
          const turnstileToken =
            requestHeaders?.get('cf-turnstile-response') ||
            requestHeaders?.get('x-captcha-response');
          if (turnstileSecret) {
            if (!turnstileToken || !requestHeaders) {
              throw new Error('CAPTCHA_VERIFICATION_FAILED');
            }
            const remoteIp = requestHeaders.get('cf-connecting-ip') ?? undefined;
            const ok = await verifyTurnstileToken(turnstileToken, turnstileSecret, remoteIp);
            if (!ok) {
              console.warn('[auth] Turnstile verification failed for', normalized);
              throw new Error('CAPTCHA_VERIFICATION_FAILED');
            }
          }

          // 3. Send via Resend or log in development
          const resendApiKey = await resolveSecret(env, 'RESEND_API_KEY');
          if (resendApiKey) {
            const storedEmailFrom = await getSetting(db, 'email_from');
            await sendOtpEmail({
              apiKey: resendApiKey,
              from:
                (storedEmailFrom !== null
                  ? storedEmailFrom || PREVIEW_EMAIL_FROM
                  : env.EMAIL_FROM?.trim()) ||
                (new URL(baseURL).host.endsWith('.workers.dev')
                  ? PREVIEW_EMAIL_FROM
                  : `noreply@${new URL(baseURL).host}`),
              to: normalized,
              otp,
            });
          } else {
            console.log(`[auth OTP for ${normalized}]: ${otp}`);
          }
        },
      }),
    ],
  });
}

/** Uses the configured site origin, or the current request origin before setup. */
export async function resolveAuthOrigin(env: Env, requestUrl: string): Promise<string> {
  try {
    return runtimeOrigin(await getSiteSettings(env), requestUrl);
  } catch {
    return runtimeOrigin(null, requestUrl);
  }
}

// Cache by binding, origin and secret: before setup both the origin and the secret can differ from
// their final values, and an instance built with the pre-setup secret must not survive setup.
const authCache = new WeakMap<D1Database, Map<string, ReturnType<typeof createAuth>>>();

export async function getAuth(env: Env, requestUrl: string) {
  const origin = await resolveAuthOrigin(env, requestUrl);
  const secret = await resolveGeneratedSecret(env, 'BETTER_AUTH_SECRET');
  let instances = authCache.get(env.DB);
  if (!instances) {
    instances = new Map();
    authCache.set(env.DB, instances);
  }
  const key = `${origin}\n${secret}`;
  let instance = instances.get(key);
  if (!instance) {
    instance = createAuth(env, origin, secret);
    instances.set(key, instance);
  }
  return instance;
}

export type Auth = ReturnType<typeof createAuth>;
