import type { Env } from '../env';

export interface SiteSettings {
  site_url: string | null;
  site_name: string | null;
  default_lang: string;
  indexing_enabled: number;
  setup_completed_at: number | null;
  updated_at: number;
}

const CACHE_MS = 60_000;
const cache = new Map<D1Database, { expiresAt: number; value: Promise<SiteSettings | null> }>();

export function invalidateSiteSettings(db?: D1Database): void {
  if (db) cache.delete(db);
  else cache.clear();
}

/** Reads the single configured site row. A missing row remains unconfigured. */
export function getSiteSettings(env: Pick<Env, 'DB'>): Promise<SiteSettings | null> {
  const db = env.DB;
  const now = Date.now();
  const hit = cache.get(db);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = db
    .prepare(
      'SELECT site_url, site_name, default_lang, indexing_enabled, setup_completed_at, updated_at FROM site_settings WHERE id = 1',
    )
    .first<SiteSettings>();
  cache.set(db, { expiresAt: now + CACHE_MS, value });
  return value;
}

export interface IndexingInput {
  settings: Pick<SiteSettings, 'site_url' | 'setup_completed_at' | 'indexing_enabled'> | null;
  publicNoindexVar: string | undefined;
  requestHost: string;
}

export function resolveIndexing({
  settings,
  publicNoindexVar,
  requestHost,
}: IndexingInput): boolean {
  if (publicNoindexVar === 'true' || !settings?.site_url || !settings.setup_completed_at)
    return false;
  try {
    if (new URL(settings.site_url).host.toLowerCase() !== requestHost.toLowerCase()) return false;
  } catch {
    return false;
  }
  return settings.indexing_enabled === 1;
}

export function runtimeOrigin(settings: SiteSettings | null, requestUrl: string): string {
  try {
    return settings?.site_url ? new URL(settings.site_url).origin : new URL(requestUrl).origin;
  } catch {
    return new URL(requestUrl).origin;
  }
}
