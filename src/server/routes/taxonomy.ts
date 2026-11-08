// Taxonomy routes (CONTRACTS §5, DESIGN §10.4).
// Categories and tags management: CRUD, sort_order, 409 CATEGORY_IN_USE, 301 redirects, requestBuild.
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireSession } from '../auth/guard';
import { getDb, recordAudit, recordSlugRedirect } from '../db';
import * as schema from '../db/schema';
import type { AppEnv } from '../http/types';
import { requestBuild } from '../services/builds';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'ต้องระบุชื่อหมวดหมู่')
    .max(100, 'ชื่อหมวดหมู่ยาวเกิน 100 ตัวอักษร'),
  slug: z.string().trim().regex(slugRegex, 'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น'),
  description: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(1, 'ต้องระบุชื่อหมวดหมู่').max(100).optional(),
  slug: z
    .string()
    .trim()
    .regex(slugRegex, 'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น')
    .optional(),
  description: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const createTagSchema = z.object({
  name: z.string().trim().min(1, 'ต้องระบุชื่อแท็ก').max(100, 'ชื่อแท็กยาวเกิน 100 ตัวอักษร'),
  slug: z.string().trim().regex(slugRegex, 'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น'),
});

const updateTagSchema = z.object({
  name: z.string().trim().min(1, 'ต้องระบุชื่อแท็ก').max(100).optional(),
  slug: z
    .string()
    .trim()
    .regex(slugRegex, 'Slug ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น')
    .optional(),
});

export const taxonomyRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------------- Category routes
  // List categories with article count (GET /api/admin/categories)
  .get('/admin/categories', requireSession, async (c) => {
    const db = getDb(c.env);

    const categories = await db
      .select({
        id: schema.category.id,
        slug: schema.category.slug,
        name: schema.category.name,
        description: schema.category.description,
        sortOrder: schema.category.sortOrder,
        createdAt: schema.category.createdAt,
        updatedAt: schema.category.updatedAt,
        articleCount: count(schema.article.id),
      })
      .from(schema.category)
      .leftJoin(schema.article, eq(schema.category.id, schema.article.categoryId))
      .groupBy(schema.category.id)
      .orderBy(asc(schema.category.sortOrder), asc(schema.category.createdAt));

    return c.json({
      data: categories.map((cat) => ({
        ...cat,
        articleCount: Number(cat.articleCount ?? 0),
      })),
    });
  })

  // Create category (POST /api/admin/categories)
  .post('/admin/categories', requireSession, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
    }

    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'ข้อมูลหมวดหมู่ไม่ถูกต้อง',
          },
        },
        422,
      );
    }

    const db = getDb(c.env);
    const sessionUser = c.get('user');
    const { name, slug, description } = parsed.data;

    // Check slug collision
    const [existing] = await db
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.slug, slug))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            code: 'SLUG_TAKEN',
            message: `Slug "${slug}" ถูกใช้งานโดยหมวดหมู่อื่นแล้ว`,
          },
        },
        409,
      );
    }

    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const [maxOrder] = await db.select({ total: count() }).from(schema.category);
      sortOrder = Number(maxOrder?.total ?? 0);
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.category).values({
      id,
      slug,
      name,
      description: description ?? null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'category.create',
      targetType: 'category',
      targetId: id,
      meta: { name, slug, sortOrder },
    });

    await requestBuild(c.env, {
      reason: 'category.create',
      requestedBy: sessionUser.id,
    });

    return c.json(
      {
        data: {
          id,
          slug,
          name,
          description: description ?? null,
          sortOrder,
          createdAt: now,
          updatedAt: now,
          articleCount: 0,
        },
      },
      201,
    );
  })

  // Update category (PATCH /api/admin/categories/:id)
  .patch('/admin/categories/:id', requireSession, async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);
    const sessionUser = c.get('user');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
    }

    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'ข้อมูลหมวดหมู่ไม่ถูกต้อง',
          },
        },
        422,
      );
    }

    const [currentCat] = await db
      .select()
      .from(schema.category)
      .where(eq(schema.category.id, id))
      .limit(1);

    if (!currentCat) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบหมวดหมู่ที่ระบุ' } }, 404);
    }

    const data = parsed.data;

    // Check slug uniqueness
    if (data.slug && data.slug !== currentCat.slug) {
      const [existing] = await db
        .select({ id: schema.category.id })
        .from(schema.category)
        .where(and(eq(schema.category.slug, data.slug), ne(schema.category.id, id)))
        .limit(1);

      if (existing) {
        return c.json(
          {
            error: {
              code: 'SLUG_TAKEN',
              message: `Slug "${data.slug}" ถูกใช้งานโดยหมวดหมู่อื่นแล้ว`,
            },
          },
          409,
        );
      }
    }

    // Check if category has published articles
    const [publishedCount] = await db
      .select({ total: count() })
      .from(schema.article)
      .where(and(eq(schema.article.categoryId, id), eq(schema.article.status, 'published')));

    const hasPublishedArticles = Number(publishedCount?.total ?? 0) > 0;

    // Record 301 redirect if slug changed on a category with published articles
    if (hasPublishedArticles && data.slug && data.slug !== currentCat.slug) {
      await recordSlugRedirect(db, {
        from: `/category/${currentCat.slug}/`,
        to: `/category/${data.slug}/`,
        reason: 'category',
      });
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.description !== undefined) updates.description = data.description;
    if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;

    await db.update(schema.category).set(updates).where(eq(schema.category.id, id));

    // Request rebuild if public output changed and published articles exist
    if (
      hasPublishedArticles &&
      (data.name !== undefined || data.slug !== undefined || data.description !== undefined)
    ) {
      await requestBuild(c.env, {
        reason: 'category.update',
        requestedBy: sessionUser.id,
      });
    }

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'category.update',
      targetType: 'category',
      targetId: id,
      meta: updates,
    });

    const [updated] = await db
      .select()
      .from(schema.category)
      .where(eq(schema.category.id, id))
      .limit(1);

    return c.json({ data: updated });
  })

  // Delete category (DELETE /api/admin/categories/:id)
  .delete('/admin/categories/:id', requireSession, async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);
    const sessionUser = c.get('user');

    const [cat] = await db
      .select()
      .from(schema.category)
      .where(eq(schema.category.id, id))
      .limit(1);

    if (!cat) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบหมวดหมู่ที่ระบุ' } }, 404);
    }

    // Check if category is in use by ANY article (draft or published)
    const [articles] = await db
      .select({ total: count() })
      .from(schema.article)
      .where(eq(schema.article.categoryId, id));

    if (Number(articles?.total ?? 0) > 0) {
      return c.json(
        {
          error: {
            code: 'CATEGORY_IN_USE',
            message: `ไม่สามารถลบหมวดหมู่ "${cat.name}" ได้เนื่องจากมีบทความใช้งานอยู่ ${articles?.total} เรื่อง`,
          },
        },
        409,
      );
    }

    await db.delete(schema.category).where(eq(schema.category.id, id));

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'category.delete',
      targetType: 'category',
      targetId: id,
      meta: { name: cat.name, slug: cat.slug },
    });

    await requestBuild(c.env, {
      reason: 'category.delete',
      requestedBy: sessionUser.id,
    });

    return c.json({ data: { success: true } });
  })

  // ---------------------------------------------------------------- Tag routes
  // List tags with article count (GET /api/admin/tags)
  .get('/admin/tags', requireSession, async (c) => {
    const db = getDb(c.env);
    const q = c.req.query('q')?.trim().toLowerCase();

    const tags = await db
      .select({
        id: schema.tag.id,
        slug: schema.tag.slug,
        name: schema.tag.name,
        createdAt: schema.tag.createdAt,
        articleCount: count(schema.articleTag.articleId),
      })
      .from(schema.tag)
      .leftJoin(schema.articleTag, eq(schema.tag.id, schema.articleTag.tagId))
      .groupBy(schema.tag.id)
      .orderBy(asc(schema.tag.name));

    let filtered = tags;
    if (q) {
      filtered = tags.filter(
        (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
      );
    }

    return c.json({
      data: filtered.map((tag) => ({
        ...tag,
        articleCount: Number(tag.articleCount ?? 0),
      })),
    });
  })

  // Create tag (POST /api/admin/tags)
  .post('/admin/tags', requireSession, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
    }

    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'ข้อมูลแท็กไม่ถูกต้อง',
          },
        },
        422,
      );
    }

    const db = getDb(c.env);
    const sessionUser = c.get('user');
    const { name, slug } = parsed.data;

    // Check slug collision
    const [existing] = await db
      .select({ id: schema.tag.id })
      .from(schema.tag)
      .where(eq(schema.tag.slug, slug))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            code: 'SLUG_TAKEN',
            message: `Slug "${slug}" ถูกใช้งานโดยแท็กอื่นแล้ว`,
          },
        },
        409,
      );
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.tag).values({
      id,
      slug,
      name,
      createdAt: now,
    });

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'tag.create',
      targetType: 'tag',
      targetId: id,
      meta: { name, slug },
    });

    await requestBuild(c.env, {
      reason: 'tag.create',
      requestedBy: sessionUser.id,
    });

    return c.json(
      {
        data: {
          id,
          slug,
          name,
          createdAt: now,
          articleCount: 0,
        },
      },
      201,
    );
  })

  // Update tag (PATCH /api/admin/tags/:id)
  .patch('/admin/tags/:id', requireSession, async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);
    const sessionUser = c.get('user');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
    }

    const parsed = updateTagSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'ข้อมูลแท็กไม่ถูกต้อง',
          },
        },
        422,
      );
    }

    const [currentTag] = await db.select().from(schema.tag).where(eq(schema.tag.id, id)).limit(1);

    if (!currentTag) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบแท็กที่ระบุ' } }, 404);
    }

    const data = parsed.data;

    // Check slug collision
    if (data.slug && data.slug !== currentTag.slug) {
      const [existing] = await db
        .select({ id: schema.tag.id })
        .from(schema.tag)
        .where(and(eq(schema.tag.slug, data.slug), ne(schema.tag.id, id)))
        .limit(1);

      if (existing) {
        return c.json(
          {
            error: {
              code: 'SLUG_TAKEN',
              message: `Slug "${data.slug}" ถูกใช้งานโดยแท็กอื่นแล้ว`,
            },
          },
          409,
        );
      }
    }

    // Check if tag has published articles
    const [publishedCount] = await db
      .select({ total: count() })
      .from(schema.articleTag)
      .innerJoin(schema.article, eq(schema.articleTag.articleId, schema.article.id))
      .where(and(eq(schema.articleTag.tagId, id), eq(schema.article.status, 'published')));

    const hasPublishedArticles = Number(publishedCount?.total ?? 0) > 0;

    // Record 301 redirect if slug changed on tag with published articles
    if (hasPublishedArticles && data.slug && data.slug !== currentTag.slug) {
      await recordSlugRedirect(db, {
        from: `/tag/${currentTag.slug}/`,
        to: `/tag/${data.slug}/`,
        reason: 'tag',
      });
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.slug !== undefined) updates.slug = data.slug;

    await db.update(schema.tag).set(updates).where(eq(schema.tag.id, id));

    if (hasPublishedArticles && (data.name !== undefined || data.slug !== undefined)) {
      await requestBuild(c.env, {
        reason: 'tag.update',
        requestedBy: sessionUser.id,
      });
    }

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'tag.update',
      targetType: 'tag',
      targetId: id,
      meta: updates,
    });

    const [updated] = await db.select().from(schema.tag).where(eq(schema.tag.id, id)).limit(1);

    return c.json({ data: updated });
  })

  // Delete tag (DELETE /api/admin/tags/:id)
  .delete('/admin/tags/:id', requireSession, async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);
    const sessionUser = c.get('user');

    const [t] = await db.select().from(schema.tag).where(eq(schema.tag.id, id)).limit(1);

    if (!t) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบแท็กที่ระบุ' } }, 404);
    }

    // Check if tag had published articles
    const [publishedCount] = await db
      .select({ total: count() })
      .from(schema.articleTag)
      .innerJoin(schema.article, eq(schema.articleTag.articleId, schema.article.id))
      .where(and(eq(schema.articleTag.tagId, id), eq(schema.article.status, 'published')));

    const hasPublishedArticles = Number(publishedCount?.total ?? 0) > 0;

    // Tags detach from articles on delete (articleTag cascade)
    await db.delete(schema.articleTag).where(eq(schema.articleTag.tagId, id));
    await db.delete(schema.tag).where(eq(schema.tag.id, id));

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'tag.delete',
      targetType: 'tag',
      targetId: id,
      meta: { name: t.name, slug: t.slug },
    });

    if (hasPublishedArticles) {
      await requestBuild(c.env, {
        reason: 'tag.delete',
        requestedBy: sessionUser.id,
      });
    }

    return c.json({ data: { success: true } });
  });
