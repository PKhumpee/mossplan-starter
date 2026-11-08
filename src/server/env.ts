import { z } from 'zod';

/** Worker bindings, vars and secrets (CONTRACTS §2). Secrets are optional here; owners tighten them. */
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;

  // vars (wrangler.jsonc)
  SITE_URL?: string;
  PUBLIC_NOINDEX: string;
  GITHUB_REPO?: string;
  GITHUB_DEPLOY_WORKFLOW?: string;
  CF_ACCOUNT_ID?: string;
  CF_WEB_ANALYTICS_SITE_TAG?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  HSTS_MAX_AGE?: string;
  EMAIL_FROM?: string;

  // secrets (`wrangler secret put`, `.dev.vars` locally)
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  CF_ANALYTICS_API_TOKEN?: string;
  BUILD_CALLBACK_TOKEN?: string;
  CLICK_HASH_SECRET?: string;
  SETUP_TOKEN?: string;
  MOSS_SECRET_KEY?: string;
}

/** A string that may be unset or empty. */
const optionalString = z.string().optional();

export const envSchema = z.object({
  PUBLIC_NOINDEX: z.enum(['true', 'false']),
  GITHUB_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/repo')
    .optional(),
  GITHUB_DEPLOY_WORKFLOW: z.string().min(1).optional(),
  CF_ACCOUNT_ID: optionalString,
  CF_WEB_ANALYTICS_SITE_TAG: optionalString,
  PUBLIC_TURNSTILE_SITE_KEY: optionalString,
  // Empty until T20 sets up Cloudflare Access (D34).
  CF_ACCESS_TEAM_DOMAIN: optionalString,
  CF_ACCESS_AUD: optionalString,
  // HSTS max-age in seconds, custom domain (SITE_URL host) only, never *.workers.dev.
  // 300 during the example.com testing period; default 31536000 when unset; "0" disables.
  HSTS_MAX_AGE: z.string().regex(/^\d+$/).optional(),
  EMAIL_FROM: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
  GITHUB_DISPATCH_TOKEN: optionalString,
  CF_ANALYTICS_API_TOKEN: optionalString,
  BUILD_CALLBACK_TOKEN: optionalString,
  CLICK_HASH_SECRET: optionalString,
  SETUP_TOKEN: optionalString,
  MOSS_SECRET_KEY: optionalString,
});

export type ParsedEnv = z.infer<typeof envSchema>;

/** Validates the vars and secrets of `env`. Throws a ZodError naming the bad keys. */
export function parseEnv(env: Env): ParsedEnv {
  return envSchema.parse(env);
}
