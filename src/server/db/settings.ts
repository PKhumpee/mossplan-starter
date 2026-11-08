import { eq } from 'drizzle-orm';
import { recordAudit } from './audit';
import type { Db } from './client';
import { setting, siteSettings } from './schema';

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select().from(setting).where(eq(setting.key, key)).limit(1);
  return row ? row.value : null;
}

/**
 * Checks whether indexing is allowed in D1 settings (default: false).
 */
export async function isIndexingAllowed(db: Db): Promise<boolean> {
  const [row] = await db.select().from(siteSettings).limit(1);
  return row?.indexingEnabled === 1;
}

/**
 * Updates a setting in D1 and records an audit log entry.
 */
export async function setSetting(
  db: Db,
  key: string,
  value: string,
  actorId?: string | null,
): Promise<void> {
  const now = Date.now();
  const existing = await getSetting(db, key);

  if (key === 'allow_indexing') {
    await db
      .insert(siteSettings)
      .values({
        id: 1,
        siteUrl: null,
        siteName: null,
        defaultLang: 'th',
        indexingEnabled: value === 'true' ? 1 : 0,
        setupCompletedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: siteSettings.id,
        set: { indexingEnabled: value === 'true' ? 1 : 0, updatedAt: now },
      });
  } else if (existing !== null) {
    await db.update(setting).set({ value, updatedAt: now }).where(eq(setting.key, key));
  } else {
    await db.insert(setting).values({
      key,
      value,
      updatedAt: now,
    });
  }

  await recordAudit(db, {
    actorId: actorId ?? null,
    action: 'setting.update',
    targetType: 'setting',
    targetId: key,
    meta: {
      key,
      previousValue: existing,
      newValue: value,
    },
  });
}
