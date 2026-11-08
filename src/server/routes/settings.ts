import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, requireSession } from '../auth/guard';
import { getDb } from '../db';
import { setSetting } from '../db/settings';
import { recordAudit } from '../db/audit';
import { getSiteSettings, invalidateSiteSettings, runtimeOrigin } from '../db/site-settings';
import { fail, ok } from '../http/respond';
import type { AppEnv } from '../http/types';
import { isValidDeployHookUrl, resolveDeployHook } from '../services/deploy-hook';
import { resolveSecret, saveSecret } from '../services/secrets';

const updateSettingsSchema = z.object({
  allow_indexing: z.boolean(),
});

const deployHookSchema = z.object({
  url: z.string().trim().max(512).refine(isValidDeployHookUrl),
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
  // Write-only per D-005: the hook URL is never returned, only whether it exists and its last 4.
  .get('/admin/settings/build-connection', requireSession, requireRole('admin'), async (c) => {
    const hook = await resolveDeployHook(c.env);
    return ok(c, {
      deploy_hook: { configured: Boolean(hook), last4: hook ? hook.slice(-4) : null },
      site_url: runtimeOrigin(await getSiteSettings(c.env), c.req.url),
    });
  })
  .put('/admin/settings/deploy-hook', requireSession, requireRole('admin'), async (c) => {
    const parsed = deployHookSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'VALIDATION_ERROR', 'Deploy Hook URL ไม่ถูกต้อง');
    if (!c.env.MOSS_SECRET_KEY)
      return fail(c, 503, 'SECRET_KEY_MISSING', 'ยังไม่ได้ตั้ง MOSS_SECRET_KEY');
    await saveSecret(c.env, 'BUILD_DEPLOY_HOOK_URL', parsed.data.url);
    await recordAudit(getDb(c.env), {
      actorId: c.get('user')?.id ?? null,
      action: 'settings.deploy_hook_update',
      targetType: 'setting',
      targetId: 'BUILD_DEPLOY_HOOK_URL',
    });
    return ok(c, { configured: true, last4: parsed.data.url.slice(-4) });
  })
  // The owner must copy this into the Workers Builds variables, so unlike D-005 inputs it is shown.
  .post('/admin/settings/build-token', requireSession, requireRole('admin'), async (c) => {
    const token = await resolveSecret(c.env, 'BUILD_CALLBACK_TOKEN').catch(() => null);
    if (!token) return fail(c, 409, 'NOT_AVAILABLE', 'ยังไม่มี token สำหรับ build');
    await recordAudit(getDb(c.env), {
      actorId: c.get('user')?.id ?? null,
      action: 'settings.build_token_reveal',
      targetType: 'setting',
      targetId: 'BUILD_CALLBACK_TOKEN',
    });
    c.header('Cache-Control', 'no-store');
    return ok(c, { token });
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
