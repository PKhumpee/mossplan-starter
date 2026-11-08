import type { Env } from '../env';
import { resolveSecret } from './secrets';

// The Worker only ever calls this exact Cloudflare endpoint, so a stored value cannot redirect it.
const DEPLOY_HOOK_URL =
  /^https:\/\/api\.cloudflare\.com\/client\/v4\/workers\/builds\/deploy_hooks\/[A-Za-z0-9-]+$/;

export function isValidDeployHookUrl(value: string): boolean {
  return DEPLOY_HOOK_URL.test(value);
}

/** The Worker secret wins over the value saved in admin settings (D-005). */
export async function resolveDeployHook(env: Env): Promise<string | null> {
  try {
    return (await resolveSecret(env, 'BUILD_DEPLOY_HOOK_URL'))?.trim() || null;
  } catch {
    console.error('[builds] could not read the Deploy Hook');
    return null;
  }
}
