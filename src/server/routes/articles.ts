// Articles API routes (CONTRACTS §5, §3, D25, D29, D30).
// Handles CRUD, publishing with validation rules, reviews, scheduling, and redirects on slug change.
import { Hono } from 'hono';
import { and, desc, eq, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireSession } from '../auth/guard';
import { recordAudit } from '../db/audit';
import { getDb } from '../db/client';
import { isProfileComplete } from '../db/profile';
import { recordSlugRedirect, releaseSlugRedirect } from '../db/redirects';
import * as schema from '../db/schema';
import { parseBody } from '../http/validate';
import type { AppEnv } from '../http/types';
import { requestBuild } from '../services/builds';
import policyConfig from '../../../config/content-policy.json';
import { getSiteSettings } from '../db/site-settings';
import { isReservedSlug } from '@mossplan/core';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CreateArticleSchema = z.strictObject({
  title: z.string().min(1, 'ต้องระบุชื่อบทความ'),
  slug: z.string().regex(SLUG_REGEX, 'รูปแบบ slug ไม่ถูกต้อง').max(80),
  excerpt: z.string().optional().default(''),
  content: z.unknown().optional(),
  coverMediaId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional().default([]),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  lang: z.enum(['th', 'en']).optional(),
  translationGroupId: z.string().nullable().optional(),
});

const UpdateArticleSchema = z.strictObject({
  title: z.string().min(1).optional(),
  slug: z.string().regex(SLUG_REGEX).max(80).optional(),
  excerpt: z.string().optional(),
  content: z.unknown().optional(),
  coverMediaId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  lang: z.enum(['th', 'en']).optional(),
  translationGroupId: z.string().nullable().optional(),
});

const PublishArticleSchema = z.strictObject({
  at: z.number().int().optional(),
});

/** Extracts all text from a Tiptap document recursively. */
function extractAllText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { text?: string; content?: unknown[] };
  let str = n.text || '';
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      str += ' ' + extractAllText(child);
    }
  }
  return str;
}

/** Extracts all link URLs from a Tiptap document and checks for blocked domains. */
export function containsBlockedDomain(doc: unknown, blockedDomains: string[]): boolean {
  if (!blockedDomains || !blockedDomains.length) return false;
  const urls: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as {
      marks?: Array<{ type?: string; attrs?: { href?: string } }>;
      content?: unknown[];
    };
    if (Array.isArray(n.marks)) {
      for (const m of n.marks) {
        if (m?.type === 'link' && m.attrs?.href) urls.push(String(m.attrs.href));
      }
    }
    if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
    }
  }

  walk(doc);

  for (const urlStr of urls) {
    try {
      const hostname = new URL(urlStr).hostname.toLowerCase();
      for (const blocked of blockedDomains) {
        const b = blocked.toLowerCase().trim();
        if (b && (hostname === b || hostname.endsWith('.' + b))) {
          return true;
        }
      }
    } catch {
      // Ignore invalid URL strings
    }
  }
  return false;
}

/** Checks whether the combined title, excerpt, and body contain any reviewTerms phrases. */
export function containsReviewTerms(text: string, reviewTerms: string[]): boolean {
  if (!reviewTerms || !reviewTerms.length) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');

  for (const term of reviewTerms) {
    const t = term.toLowerCase().trim().replace(/\s+/g, ' ');
    if (t && normalized.includes(t)) {
      return true;
    }
  }
  return false;
}

export const articlesRoutes = new Hono<AppEnv>()
  // All article routes require session
  .use('/admin/articles/*', requireSession)
  .use('/admin/articles', requireSession)

  // 1. GET /api/admin/articles (list with pagination, filters, and tab counts)
  .get('/admin/articles', async (c) => {
    const db = getDb(c.env);
    const query = c.req.query();
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const statusFilter = query.status;
    const searchFilter = query.q?.trim();
    const categoryFilter = query.categoryId;

    const conditions = [];
    if (statusFilter === 'draft' || statusFilter === 'scheduled' || statusFilter === 'published') {
      conditions.push(eq(schema.article.status, statusFilter));
    }
    if (searchFilter) {
      conditions.push(like(schema.article.title, `%${searchFilter}%`));
    }
    if (categoryFilter) {
      conditions.push(eq(schema.article.categoryId, categoryFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch items with authors and categories
    const rows = await db
      .select({
        id: schema.article.id,
        slug: schema.article.slug,
        title: schema.article.title,
        excerpt: schema.article.excerpt,
        status: schema.article.status,
        publishedAt: schema.article.publishedAt,
        contentModifiedAt: schema.article.contentModifiedAt,
        updatedAt: schema.article.updatedAt,
        createdAt: schema.article.createdAt,
        categoryId: schema.article.categoryId,
        categoryName: schema.category.name,
        authorId: schema.article.authorId,
        authorName: schema.user.name,
      })
      .from(schema.article)
      .leftJoin(schema.category, eq(schema.article.categoryId, schema.category.id))
      .leftJoin(schema.user, eq(schema.article.authorId, schema.user.id))
      .where(whereClause)
      .orderBy(desc(schema.article.updatedAt))
      .limit(limit)
      .offset(offset);

    // Total for current filter
    const totalRows = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.article)
      .where(whereClause);
    const total = Number(totalRows[0]?.total) || 0;

    // Tab counts for quick navigation
    const allCounts = await db
      .select({
        status: schema.article.status,
        count: sql<number>`count(*)`,
      })
      .from(schema.article)
      .groupBy(schema.article.status);

    const counts = {
      all: 0,
      draft: 0,
      scheduled: 0,
      published: 0,
    };

    for (const row of allCounts) {
      const count = Number(row.count) || 0;
      counts.all += count;
      if (row.status === 'draft') counts.draft = count;
      else if (row.status === 'scheduled') counts.scheduled = count;
      else if (row.status === 'published') counts.published = count;
    }

    return c.json({
      data: {
        items: rows,
        page,
        limit,
        total: Number(total) || 0,
        counts,
      },
    });
  })

  // 2. POST /api/admin/articles (create draft)
  .post('/admin/articles', async (c) => {
    const user = c.get('user');
    const db = getDb(c.env);
    const body = await parseBody(c, CreateArticleSchema);

    if (isReservedSlug(body.slug)) {
      return c.json(
        { error: { code: 'SLUG_RESERVED', message: 'slug นี้สงวนไว้สำหรับระบบ' } },
        422,
      );
    }

    // Check slug collision
    const [existing] = await db
      .select({ id: schema.article.id })
      .from(schema.article)
      .where(eq(schema.article.slug, body.slug))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            code: 'SLUG_TAKEN',
            message: 'ลิงก์บทความ (slug) นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น',
          },
        },
        409,
      );
    }

    const now = Date.now();
    const siteSettings = await getSiteSettings(c.env);
    const articleId = crypto.randomUUID();
    const defaultContent = body.content ?? {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };

    await db.insert(schema.article).values({
      id: articleId,
      slug: body.slug,
      title: body.title,
      excerpt: body.excerpt,
      contentJson: JSON.stringify(defaultContent),
      coverMediaId: body.coverMediaId ?? null,
      categoryId: body.categoryId ?? null,
      authorId: user.id,
      status: 'draft',
      seoTitle: body.seoTitle ?? null,
      seoDescription: body.seoDescription ?? null,
      lang: body.lang ?? (siteSettings?.default_lang === 'en' ? 'en' : 'th'),
      translationGroupId: body.translationGroupId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // A new article taking a slug that used to redirect wins (D30).
    await releaseSlugRedirect(db, `/${body.slug}/`);

    if (body.tagIds.length > 0) {
      await db.insert(schema.articleTag).values(
        body.tagIds.map((tid) => ({
          articleId,
          tagId: tid,
        })),
      );
    }

    await recordAudit(db, {
      actorId: user.id,
      action: 'article.create',
      targetType: 'article',
      targetId: articleId,
      meta: { slug: body.slug, title: body.title },
    });

    return c.json(
      {
        data: {
          id: articleId,
          slug: body.slug,
          title: body.title,
          status: 'draft',
        },
      },
      201,
    );
  })

  // 3. GET /api/admin/articles/:id (one article with tag IDs)
  .get('/admin/articles/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);

    const [art] = await db.select().from(schema.article).where(eq(schema.article.id, id)).limit(1);

    if (!art) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบบทความ' } }, 404);
    }

    const tags = await db
      .select({ tagId: schema.articleTag.tagId })
      .from(schema.articleTag)
      .where(eq(schema.articleTag.articleId, id));

    let content: unknown = null;
    try {
      content = JSON.parse(art.contentJson);
    } catch {
      content = null;
    }

    return c.json({
      data: {
        ...art,
        content,
        tagIds: tags.map((t) => t.tagId),
      },
    });
  })

  // 4. PATCH /api/admin/articles/:id (update article fields, content, tags)
  .patch('/admin/articles/:id', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c.env);
    const body = await parseBody(c, UpdateArticleSchema);

    if (body.slug && isReservedSlug(body.slug)) {
      return c.json(
        { error: { code: 'SLUG_RESERVED', message: 'slug นี้สงวนไว้สำหรับระบบ' } },
        422,
      );
    }

    const [existing] = await db
      .select()
      .from(schema.article)
      .where(eq(schema.article.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบบทความ' } }, 404);
    }

    const now = Date.now();
    const isPublished = existing.status === 'published';

    // Slug change handling
    if (body.slug && body.slug !== existing.slug) {
      const [conflict] = await db
        .select({ id: schema.article.id })
        .from(schema.article)
        .where(eq(schema.article.slug, body.slug))
        .limit(1);

      if (conflict) {
        return c.json(
          {
            error: {
              code: 'SLUG_TAKEN',
              message: 'ลิงก์บทความ (slug) นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น',
            },
          },
          409,
        );
      }

      // If already published, record a single-hop 301 redirect (D30, CONTRACTS §3)
      if (isPublished) {
        const currentSiteSettings = await getSiteSettings(c.env);
        const prefix =
          existing.lang !== (currentSiteSettings?.default_lang ?? 'th') ? `/${existing.lang}` : '';
        await recordSlugRedirect(db, {
          reason: 'article',
          from: `${prefix}/${existing.slug}/`,
          to: `${prefix}/${body.slug}/`,
        });
      } else {
        // The article now owns this URL; any old redirect from it must go (no shadowing, no loops).
        await releaseSlugRedirect(db, `/${body.slug}/`);
      }
    }

    // Determine content_modified_at update (D30):
    // Moves ONLY when title, excerpt, or content change while published.
    let nextContentModifiedAt = existing.contentModifiedAt;
    const contentChanged =
      (body.title !== undefined && body.title !== existing.title) ||
      (body.excerpt !== undefined && body.excerpt !== existing.excerpt) ||
      (body.content !== undefined && JSON.stringify(body.content) !== existing.contentJson);

    if (isPublished && contentChanged) {
      nextContentModifiedAt = now;
    }

    const updateValues: Record<string, unknown> = {
      updatedAt: now,
      contentModifiedAt: nextContentModifiedAt,
    };

    if (body.title !== undefined) updateValues.title = body.title;
    if (body.slug !== undefined) updateValues.slug = body.slug;
    if (body.excerpt !== undefined) updateValues.excerpt = body.excerpt;
    if (body.content !== undefined) updateValues.contentJson = JSON.stringify(body.content);
    if (body.coverMediaId !== undefined) updateValues.coverMediaId = body.coverMediaId;
    if (body.categoryId !== undefined) updateValues.categoryId = body.categoryId;
    if (body.seoTitle !== undefined) updateValues.seoTitle = body.seoTitle;
    if (body.seoDescription !== undefined) updateValues.seoDescription = body.seoDescription;
    if (body.lang !== undefined) updateValues.lang = body.lang;
    if (body.translationGroupId !== undefined)
      updateValues.translationGroupId = body.translationGroupId;

    await db.update(schema.article).set(updateValues).where(eq(schema.article.id, id));

    // Update tags if provided
    if (body.tagIds !== undefined) {
      await db.delete(schema.articleTag).where(eq(schema.articleTag.articleId, id));
      if (body.tagIds.length > 0) {
        await db.insert(schema.articleTag).values(
          body.tagIds.map((tid) => ({
            articleId: id,
            tagId: tid,
          })),
        );
      }
    }

    await recordAudit(db, {
      actorId: user.id,
      action: 'article.update',
      targetType: 'article',
      targetId: id,
      meta: { changes: Object.keys(updateValues) },
    });

    // Request rebuild if published and public output changed
    if (isPublished) {
      await requestBuild(c.env, {
        reason: 'article.update',
        requestedBy: user.id,
      });
    }

    return c.json({
      data: {
        id,
        slug: body.slug || existing.slug,
        title: body.title || existing.title,
        status: existing.status,
      },
    });
  })

  // 5. DELETE /api/admin/articles/:id (delete article, 409 if published)
  .delete('/admin/articles/:id', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c.env);

    const [existing] = await db
      .select({ id: schema.article.id, status: schema.article.status, title: schema.article.title })
      .from(schema.article)
      .where(eq(schema.article.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบบทความ' } }, 404);
    }

    if (existing.status === 'published') {
      return c.json(
        {
          error: {
            code: 'ARTICLE_PUBLISHED',
            message: 'ไม่สามารถลบบทความที่เผยแพร่อยู่ได้ กรุณายกเลิกการเผยแพร่ก่อน',
          },
        },
        409,
      );
    }

    // Cascade delete article tags and article row
    await db.delete(schema.articleTag).where(eq(schema.articleTag.articleId, id));
    await db.delete(schema.article).where(eq(schema.article.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'article.delete',
      targetType: 'article',
      targetId: id,
      meta: { title: existing.title },
    });

    return c.json({ data: { success: true } });
  })

  // 6. POST /api/admin/articles/:id/publish (publish or schedule)
  .post('/admin/articles/:id/publish', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c.env);
    const body = await parseBody(c, PublishArticleSchema);

    const [art] = await db.select().from(schema.article).where(eq(schema.article.id, id)).limit(1);

    if (!art) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบบทความ' } }, 404);
    }

    // ---------------- Publish validation rules (CONTRACTS §3, D25, D29)
    // 1. Author profile must be complete
    const [author] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, art.authorId))
      .limit(1);

    if (!author || !isProfileComplete(author)) {
      return c.json(
        {
          error: {
            code: 'AUTHOR_PROFILE_INCOMPLETE',
            message:
              'โปรไฟล์ผู้เขียนยังไม่สมบูรณ์ ต้องมีชื่อ ตำแหน่ง และประวัติย่ออย่างน้อย 150 ตัวอักษร',
          },
        },
        422,
      );
    }

    // 2. Blocked domains check
    let parsedContent: unknown = null;
    try {
      parsedContent = JSON.parse(art.contentJson);
    } catch {
      parsedContent = null;
    }

    if (containsBlockedDomain(parsedContent, policyConfig.blockedDomains || [])) {
      return c.json(
        {
          error: {
            code: 'CONTENT_BLOCKED',
            message: 'เนื้อหามีลิงก์ไปยังเว็บไซต์ที่ละเมิดนโยบายความปลอดภัย',
          },
        },
        422,
      );
    }

    // 3. Review required check
    const combinedText = `${art.title} ${art.excerpt} ${extractAllText(parsedContent)}`;
    if (containsReviewTerms(combinedText, policyConfig.reviewTerms || []) && !art.reviewedBy) {
      return c.json(
        {
          error: {
            code: 'REVIEW_REQUIRED',
            message: 'บทความนี้มีเนื้อหาที่ต้องผ่านการตรวจทานก่อนเผยแพร่',
          },
        },
        422,
      );
    }

    const now = Date.now();
    const isFuture = body.at !== undefined && body.at > now;
    const targetStatus = isFuture ? 'scheduled' : 'published';
    const publishedAt = isFuture ? body.at! : body.at || now;
    const contentModifiedAt = art.contentModifiedAt || publishedAt;

    await db
      .update(schema.article)
      .set({
        status: targetStatus,
        publishedAt,
        contentModifiedAt,
        updatedAt: now,
      })
      .where(eq(schema.article.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'article.publish',
      targetType: 'article',
      targetId: id,
      meta: { status: targetStatus, publishedAt },
    });

    if (targetStatus === 'published') {
      await requestBuild(c.env, {
        reason: 'article.publish',
        requestedBy: user.id,
      });
    }

    return c.json({
      data: {
        id,
        status: targetStatus,
        publishedAt,
      },
    });
  })

  // 7. POST /api/admin/articles/:id/unpublish (revert to draft)
  .post('/admin/articles/:id/unpublish', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c.env);

    const [art] = await db
      .select({ id: schema.article.id, status: schema.article.status })
      .from(schema.article)
      .where(eq(schema.article.id, id))
      .limit(1);

    if (!art) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบบทความ' } }, 404);
    }

    const now = Date.now();
    await db
      .update(schema.article)
      .set({
        status: 'draft',
        updatedAt: now,
      })
      .where(eq(schema.article.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'article.unpublish',
      targetType: 'article',
      targetId: id,
    });

    await requestBuild(c.env, {
      reason: 'article.unpublish',
      requestedBy: user.id,
    });

    return c.json({ data: { id, status: 'draft' } });
  })

  // 8. POST /api/admin/articles/:id/review (caller becomes reviewer)
  .post('/admin/articles/:id/review', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c.env);

    const [art] = await db.select().from(schema.article).where(eq(schema.article.id, id)).limit(1);

    if (!art) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบบทความ' } }, 404);
    }

    // Author cannot review own article (CHECK constraint + API check)
    if (art.authorId === user.id) {
      return c.json(
        {
          error: {
            code: 'REVIEWER_IS_AUTHOR',
            message: 'ผู้เขียนไม่สามารถเป็นผู้ตรวจทานบทความของตนเองได้',
          },
        },
        422,
      );
    }

    // Reviewer's own profile must be complete
    const [reviewerUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, user.id))
      .limit(1);

    if (!reviewerUser || !isProfileComplete(reviewerUser)) {
      return c.json(
        {
          error: {
            code: 'AUTHOR_PROFILE_INCOMPLETE',
            message:
              'โปรไฟล์ของผู้ตรวจทานยังไม่สมบูรณ์ ต้องมีชื่อ ตำแหน่ง และประวัติย่ออย่างน้อย 150 ตัวอักษร',
          },
        },
        422,
      );
    }

    const now = Date.now();
    await db
      .update(schema.article)
      .set({
        reviewedBy: user.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.article.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'article.review',
      targetType: 'article',
      targetId: id,
    });

    if (art.status === 'published') {
      await requestBuild(c.env, {
        reason: 'article.review',
        requestedBy: user.id,
      });
    }

    return c.json({
      data: {
        id,
        reviewedBy: user.id,
        reviewedAt: now,
      },
    });
  })

  // 9. DELETE /api/admin/articles/:id/review (clear review)
  .delete('/admin/articles/:id/review', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const db = getDb(c.env);

    const [art] = await db.select().from(schema.article).where(eq(schema.article.id, id)).limit(1);

    if (!art) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบบทความ' } }, 404);
    }

    // Only reviewer or admin can clear review
    if (user.role !== 'admin' && user.role !== 'owner' && user.id !== art.reviewedBy) {
      return c.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'เฉพาะผู้ตรวจทานหรือผู้ดูแลระบบเท่านั้นที่สามารถยกเลิกการตรวจทานได้',
          },
        },
        403,
      );
    }

    const now = Date.now();
    await db
      .update(schema.article)
      .set({
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: now,
      })
      .where(eq(schema.article.id, id));

    await recordAudit(db, {
      actorId: user.id,
      action: 'article.review_clear',
      targetType: 'article',
      targetId: id,
    });

    if (art.status === 'published') {
      await requestBuild(c.env, {
        reason: 'article.review_clear',
        requestedBy: user.id,
      });
    }

    return c.json({ data: { id, reviewedBy: null, reviewedAt: null } });
  });
