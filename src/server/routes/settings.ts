import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, requireSession } from '../auth/guard';
import { getDb } from '../db';
import { setSetting } from '../db/settings';
import { getSiteSettings, invalidateSiteSettings } from '../db/site-settings';
import type { AppEnv } from '../http/types';

const updateSettingsSchema = z.object({
  allow_indexing: z.boolean(),
});

export const settingsRoutes = new Hono<AppEnv>()
  .get('/admin/settings', requireSession, async (c) => {
    const settings = await getSiteSettings(c.env);
    const allowIndexing = settings?.indexing_enabled === 1;
    const host = new URL(c.req.url).host;
    const isWorkersDev = host.endsWith('.workers.dev');
    const hardNoindex = c.env.PUBLIC_NOINDEX === 'true';

    return c.json({
      data: {
        allow_indexing: allowIndexing,
        hard_override: hardNoindex,
        is_workers_dev: isWorkersDev,
      },
    });
  })
  .put('/admin/settings', requireSession, requireRole('admin'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'ข้อมูลไม่ถูกต้อง',
          },
        },
        400,
      );
    }

    const db = getDb(c.env);
    const user = c.get('user');
    await c.env.DB.prepare(
      `INSERT INTO site_settings (id, site_url, site_name, default_lang, indexing_enabled, setup_completed_at, updated_at)
      VALUES (1, NULL, NULL, 'th', ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET indexing_enabled = excluded.indexing_enabled, updated_at = excluded.updated_at`,
    )
      .bind(parsed.data.allow_indexing ? 1 : 0, Date.now())
      .run();
    await setSetting(db, 'allow_indexing', String(parsed.data.allow_indexing), user?.id);
    invalidateSiteSettings(c.env.DB);

    return c.json({
      data: {
        allow_indexing: parsed.data.allow_indexing,
        success: true,
      },
    });
  })
  .post('/admin/settings', requireSession, requireRole('admin'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'ข้อมูลไม่ถูกต้อง',
          },
        },
        400,
      );
    }

    const db = getDb(c.env);
    const user = c.get('user');
    await c.env.DB.prepare(
      `INSERT INTO site_settings (id, site_url, site_name, default_lang, indexing_enabled, setup_completed_at, updated_at)
      VALUES (1, NULL, NULL, 'th', ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET indexing_enabled = excluded.indexing_enabled, updated_at = excluded.updated_at`,
    )
      .bind(parsed.data.allow_indexing ? 1 : 0, Date.now())
      .run();
    await setSetting(db, 'allow_indexing', String(parsed.data.allow_indexing), user?.id);
    invalidateSiteSettings(c.env.DB);

    return c.json({
      data: {
        allow_indexing: parsed.data.allow_indexing,
        success: true,
      },
    });
  });
