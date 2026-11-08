// Admin builds routes (CONTRACTS §5, DESIGN §7.1, T12).
// GET /api/admin/builds (recent builds, role E)
// POST /api/admin/builds (manual rebuild, role A)
import { count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, requireSession } from '../auth/guard';
import { getDb } from '../db/client';
import { recordAudit } from '../db/audit';
import * as schema from '../db/schema';
import { ok } from '../http/respond';
import type { AppEnv } from '../http/types';
import { requestBuild } from '../services/builds';

const ManualBuildSchema = z.strictObject({
  reason: z.string().trim().max(200).optional(),
});

export const buildsRoutes = new Hono<AppEnv>()
  // 1. GET /api/admin/builds (recent builds, role E)
  .get('/admin/builds', requireSession, async (c) => {
    const db = getDb(c.env);
    const query = c.req.query();
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const [totalRes] = await db.select({ total: count() }).from(schema.build);
    const total = Number(totalRes?.total ?? 0);

    const items = await db
      .select({
        id: schema.build.id,
        status: schema.build.status,
        reason: schema.build.reason,
        requestedBy: schema.build.requestedBy,
        requestedAt: schema.build.requestedAt,
        startedAt: schema.build.startedAt,
        finishedAt: schema.build.finishedAt,
        runUrl: schema.build.runUrl,
        error: schema.build.error,
        requestedByName: schema.user.name,
      })
      .from(schema.build)
      .leftJoin(schema.user, eq(schema.build.requestedBy, schema.user.id))
      .orderBy(desc(schema.build.requestedAt))
      .limit(limit)
      .offset(offset);

    return ok(c, {
      items,
      page,
      limit,
      total,
    });
  })

  // 2. POST /api/admin/builds (manual rebuild, role A)
  .post('/admin/builds', requireSession, requireRole('admin'), async (c) => {
    const user = c.get('user');
    let reason = 'manual';

    try {
      const text = await c.req.text();
      if (text.trim()) {
        const body = JSON.parse(text);
        const parsed = ManualBuildSchema.safeParse(body);
        if (parsed.success && parsed.data.reason) {
          reason = parsed.data.reason;
        }
      }
    } catch {
      // Empty or non-JSON body falls back to default 'manual' reason
    }

    const { buildId } = await requestBuild(c.env, {
      reason,
      requestedBy: user.id,
    });

    const db = getDb(c.env);
    await recordAudit(db, {
      actorId: user.id,
      action: 'build.trigger',
      targetType: 'build',
      targetId: buildId,
      meta: { reason },
    });

    return ok(c, { buildId }, 201);
  });
