import type { SetupDraft } from './setup';

/** Setup settings writes are part of the same D1 batch as the one-time completion claim. */
export function prepareSetupSettingsWrite(
  db: D1Database,
  draft: Pick<
    SetupDraft,
    'siteName' | 'siteUrl' | 'defaultLang' | 'indexingEnabled' | 'turnstileSiteKey' | 'emailFrom'
  >,
  now: number,
  consumeNonce: string,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO site_settings (id, site_url, site_name, default_lang, indexing_enabled, setup_completed_at, updated_at)
       SELECT 1, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)
       ON CONFLICT(id) DO UPDATE SET site_url = excluded.site_url, site_name = excluded.site_name,
       default_lang = excluded.default_lang, indexing_enabled = excluded.indexing_enabled,
       setup_completed_at = excluded.setup_completed_at, updated_at = excluded.updated_at`,
      )
      .bind(
        draft.siteUrl,
        draft.siteName,
        draft.defaultLang,
        draft.indexingEnabled ? 1 : 0,
        now,
        now,
        consumeNonce,
      ),
    db
      .prepare(
        `INSERT INTO setting (key, value, updated_at)
       SELECT 'turnstile_site_key', ?, ? WHERE EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(draft.turnstileSiteKey, now, consumeNonce),
    db
      .prepare(
        `INSERT INTO setting (key, value, updated_at)
       SELECT 'email_from', ?, ? WHERE EXISTS (SELECT 1 FROM setup_state WHERE id = 1 AND consumed_at = ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(draft.emailFrom ?? '', now, consumeNonce),
  ];
}
