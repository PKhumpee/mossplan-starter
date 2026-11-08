// Build-time reader for the site config (CONTRACTS §2a). Node only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { siteFrom, type SiteInput } from '../../src/shared/site';

const DEFAULT_PATH = resolve(import.meta.dirname, '../../wrangler.jsonc');

interface WranglerConfig {
  vars?: Record<string, unknown>;
}

/** Parses `wrangler.jsonc` text and validates the two site values. Pure, so it can be unit tested. */
export function parseSiteConfig(text: string): SiteInput {
  const errors: ParseError[] = [];
  const config = parse(text, errors, { allowTrailingComma: true }) as WranglerConfig | undefined;
  if (errors.length > 0 || !config) {
    const first = errors[0];
    throw new Error(
      `wrangler.jsonc is not valid JSONC${first ? `: ${printParseErrorCode(first.error)}` : ''}`,
    );
  }

  const SITE_URL = 'https://moss-origin.invalid';
  const PUBLIC_NOINDEX = config.vars?.PUBLIC_NOINDEX;
  if (typeof PUBLIC_NOINDEX !== 'string') {
    throw new Error('wrangler.jsonc vars.PUBLIC_NOINDEX must be the string "true" or "false"');
  }

  // Validates https origin and the "true"/"false" switch; throws with a clear message otherwise.
  siteFrom({ SITE_URL, PUBLIC_NOINDEX });

  return { SITE_URL, PUBLIC_NOINDEX };
}

export function readSiteConfig(path: string = DEFAULT_PATH): SiteInput {
  return parseSiteConfig(readFileSync(path, 'utf8'));
}
