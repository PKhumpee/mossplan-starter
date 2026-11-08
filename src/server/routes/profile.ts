// Profile routes (CONTRACTS §5, DESIGN §10.5).
// GET/PATCH /api/admin/profile (caller) and PATCH /api/admin/team/users/:id/profile (admin).
import { eq, and, ne, count, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, requireSession } from '../auth/guard';
import { getDb, recordAudit, recordSlugRedirect } from '../db';
import * as schema from '../db/schema';
import { graphemeLength, isProfileComplete, parseJsonArray } from '../db/profile';
import type { AppEnv } from '../http/types';
import { requestBuild } from '../services/builds';

const profileUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'ต้องระบุชื่อผู้เขียน')
    .max(100, 'ชื่อยาวเกิน 100 ตัวอักษร')
    .optional(),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น (เช่น somchai-dee)',
    )
    .nullable()
    .optional(),
  jobTitle: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((val) => !val || graphemeLength(val) <= 80, {
      message: 'ตำแหน่งต้องไม่เกิน 80 ตัวอักษร',
    }),
  bio: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((val) => !val || graphemeLength(val) <= 600, {
      message: 'ประวัติย่อต้องไม่เกิน 600 ตัวอักษร',
    }),
  avatarMediaId: z.string().nullable().optional(),
  sameAs: z
    .array(
      z.string().refine(
        (u) => {
          try {
            const parsed = new URL(u);
            return parsed.protocol === 'https:';
          } catch {
            return false;
          }
        },
        {
          message: 'ลิงก์ภายนอกต้องเป็น URL ที่ขึ้นต้นด้วย https:// เท่านั้น',
        },
      ),
    )
    .max(6, 'ลิงก์โปรไฟล์ภายนอกได้สูงสุด 6 รายการ')
    .optional(),
  knowsAbout: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'หัวข้อความเชี่ยวชาญต้องไม่ว่าง')
        .max(50, 'หัวข้อยาวเกิน 50 ตัวอักษร'),
    )
    .max(8, 'ความเชี่ยวชาญได้สูงสุด 8 รายการ')
    .optional(),
});

export const profileRoutes = new Hono<AppEnv>()
  // Read caller's own profile (GET /api/admin/profile)
  .get('/admin/profile', requireSession, async (c) => {
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
        avatarMediaId: schema.user.avatarMediaId,
        sameAsJson: schema.user.sameAsJson,
        knowsAboutJson: schema.user.knowsAboutJson,
        createdAt: schema.user.createdAt,
      })
      .from(schema.user)
      .where(eq(schema.user.id, sessionUser.id))
      .limit(1);

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลผู้ใช้' } }, 404);
    }

    const sameAs = parseJsonArray(row.sameAsJson);
    const knowsAbout = parseJsonArray(row.knowsAboutJson);
    const complete = isProfileComplete(row);

    return c.json({
      data: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        slug: row.slug,
        jobTitle: row.jobTitle,
        bio: row.bio,
        avatarMediaId: row.avatarMediaId,
        sameAs,
        knowsAbout,
        complete,
        createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
      },
    });
  })

  // Update caller's own profile (PATCH /api/admin/profile)
  .patch('/admin/profile', requireSession, async (c) => {
    const sessionUser = c.get('user');
    return handleProfileUpdate(c, sessionUser.id, sessionUser.id, false);
  })

  // Admin edits anyone's profile (PATCH /api/admin/team/users/:id/profile)
  .patch('/admin/team/users/:id/profile', requireSession, requireRole('admin'), async (c) => {
    const sessionUser = c.get('user');
    const targetUserId = c.req.param('id');
    return handleProfileUpdate(c, targetUserId, sessionUser.id, true);
  });

async function handleProfileUpdate(
  c: any,
  targetUserId: string,
  actorId: string,
  byAdmin: boolean,
) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message || 'ข้อมูลโปรไฟล์ไม่ถูกต้อง',
          details: parsed.error.flatten(),
        },
      },
      422,
    );
  }

  const data = parsed.data;
  const db = getDb(c.env);

  // Fetch current user
  const [currentUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);

  if (!currentUser) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้ที่ระบุ' } }, 404);
  }

  // Validate slug uniqueness if updated
  if (data.slug !== undefined && data.slug !== null && data.slug !== currentUser.slug) {
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.slug, data.slug), ne(schema.user.id, targetUserId)))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            code: 'SLUG_TAKEN',
            message: `Slug "${data.slug}" ถูกใช้งานโดยสมาชิกคนอื่นแล้ว`,
          },
        },
        409,
      );
    }
  }

  // Prepare database updates
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.slug !== undefined) updates.slug = data.slug;
  if (data.jobTitle !== undefined) updates.jobTitle = data.jobTitle;
  if (data.bio !== undefined) updates.bio = data.bio;
  if (data.avatarMediaId !== undefined) updates.avatarMediaId = data.avatarMediaId;
  if (data.sameAs !== undefined) updates.sameAsJson = JSON.stringify(data.sameAs);
  if (data.knowsAbout !== undefined) updates.knowsAboutJson = JSON.stringify(data.knowsAbout);

  if (Object.keys(updates).length > 0) {
    await db.update(schema.user).set(updates).where(eq(schema.user.id, targetUserId));
  }

  // Fetch updated user to verify complete status
  const [updatedUser] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, targetUserId))
    .limit(1);

  if (!updatedUser) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้ที่ระบุ' } }, 404);
  }

  const complete = isProfileComplete(updatedUser);

  // Check if target user has published articles (as author or reviewer)
  const [articlesCount] = await db
    .select({ total: count() })
    .from(schema.article)
    .where(
      and(
        or(eq(schema.article.authorId, targetUserId), eq(schema.article.reviewedBy, targetUserId)),
        eq(schema.article.status, 'published'),
      ),
    );

  const hasPublishedArticles = Number(articlesCount?.total ?? 0) > 0;

  // If author has published articles:
  // 1. Slug change records a 301 redirect for /authors/<oldSlug>/ -> /authors/<newSlug>/
  if (hasPublishedArticles && currentUser.slug && data.slug && currentUser.slug !== data.slug) {
    await recordSlugRedirect(db, {
      from: `/authors/${currentUser.slug}/`,
      to: `/authors/${data.slug}/`,
      reason: 'author',
    });
  }

  // 2. Any change to public profile fields of an author with published articles requests build
  if (hasPublishedArticles) {
    await requestBuild(c.env, {
      reason: 'profile.update',
      requestedBy: actorId,
    });
  }

  // Record audit log
  await recordAudit(db, {
    actorId,
    action: 'profile.update',
    targetType: 'user',
    targetId: targetUserId,
    meta: {
      byAdmin: byAdmin && actorId !== targetUserId,
      fields: Object.keys(updates),
    },
  });

  return c.json({
    data: {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      slug: updatedUser.slug,
      jobTitle: updatedUser.jobTitle,
      bio: updatedUser.bio,
      avatarMediaId: updatedUser.avatarMediaId,
      sameAs: parseJsonArray(updatedUser.sameAsJson),
      knowsAbout: parseJsonArray(updatedUser.knowsAboutJson),
      complete,
      createdAt:
        updatedUser.createdAt instanceof Date
          ? updatedUser.createdAt.getTime()
          : Number(updatedUser.createdAt),
    },
  });
}
