// Auth routes (CONTRACTS §5): Better Auth endpoints and GET /api/admin/me.
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getAuth } from '../auth/better-auth';
import { requireSession } from '../auth/guard';
import { getDb } from '../db/client';
import { isProfileComplete } from '../db/profile';
import * as schema from '../db/schema';
import type { AppEnv } from '../http/types';

export const authRoutes = new Hono<AppEnv>()
  // Mount Better Auth handler (public: /api/auth/*)
  .on(['GET', 'POST'], '/auth/*', async (c) => {
    const auth = await getAuth(c.env, c.req.url);
    const rawReq = c.req.raw;
    const url = new URL(rawReq.url);
    // Strip trailing slash if present so Better Auth routes match correctly
    if (url.pathname.endsWith('/') && url.pathname.length > 1) {
      url.pathname = url.pathname.slice(0, -1);
      const normalizedReq = new Request(url.toString(), rawReq);
      return auth.handler(normalizedReq);
    }
    return auth.handler(rawReq);
  })
  // Current user info (editor or admin: GET /api/admin/me)
  .get('/admin/me', requireSession, async (c) => {
    const sessionUser = c.get('user');
    const db = getDb(c.env);

    const [row] = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        role: schema.user.role,
        slug: schema.user.slug,
        jobTitle: schema.user.jobTitle,
        bio: schema.user.bio,
      })
      .from(schema.user)
      .where(eq(schema.user.id, sessionUser.id))
      .limit(1);

    if (!row) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'ไม่พบข้อมูลผู้ใช้ในระบบ',
          },
        },
        404,
      );
    }

    const profileComplete = isProfileComplete(row);

    return c.json({
      data: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role as 'admin' | 'editor',
        profileComplete,
      },
    });
  });
