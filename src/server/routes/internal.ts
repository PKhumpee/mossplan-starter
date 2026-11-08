// Internal API routes for CI and builds (CONTRACTS §5, §6, §8, T12).
// Protected by Bearer BUILD_CALLBACK_TOKEN compared in constant time.
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { isProfileComplete, parseJsonArray } from '../db/profile';
import * as schema from '../db/schema';
import * as affiliateSchema from '../db/affiliate';
import { fail, ok } from '../http/respond';
import type { AppEnv } from '../http/types';
import { SnapshotSchema, type Snapshot } from '../../shared/snapshot';
import { getSiteSettings, runtimeOrigin } from '../db/site-settings';
import { resolveSecret } from '../services/secrets';

/**
 * Constant-time comparison using SHA-256 digests.
 * Hashing both values guarantees fixed 32-byte buffers, preventing any length leakage.
 */
export async function timingSafeTokenEqual(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [h1, h2] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const u1 = new Uint8Array(h1);
  const u2 = new Uint8Array(h2);

  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= (u1[i] ?? 0) ^ (u2[i] ?? 0);
  }
  return diff === 0;
}

const BuildStatusUpdateSchema = z.strictObject({
  status: z.enum(['running', 'succeeded', 'failed']),
  runUrl: z.string().optional(),
  error: z.string().optional(),
});

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function hasActiveAffiliateMark(content: unknown, activeLinkIds: Set<string>): boolean {
  if (!content || typeof content !== 'object') return false;
  const node = content as {
    marks?: Array<{ type: string; attrs?: { linkId?: string } }>;
    content?: unknown[];
  };
  if (Array.isArray(node.marks)) {
    for (const m of node.marks) {
      if (m.type === 'affiliateLink' && m.attrs?.linkId && activeLinkIds.has(m.attrs.linkId)) {
        return true;
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (hasActiveAffiliateMark(child, activeLinkIds)) return true;
    }
  }
  return false;
}

export const internalRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------------- Authentication guard
  .use('/internal/*', async (c, next) => {
    const expected = (await resolveSecret(c.env, 'BUILD_CALLBACK_TOKEN').catch(() => null))?.trim();
    if (!expected) {
      return fail(
        c,
        401,
        'UNAUTHENTICATED',
        'BUILD_CALLBACK_TOKEN is not configured on the Worker',
      );
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return fail(c, 401, 'UNAUTHENTICATED', 'Missing Authorization header');
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return fail(c, 401, 'UNAUTHENTICATED', 'Invalid Authorization header format');
    }

    const tokenMatch = match[1];
    if (!tokenMatch) {
      return fail(c, 401, 'UNAUTHENTICATED', 'Invalid Authorization header format');
    }

    const provided = tokenMatch.trim();
    const isValid = await timingSafeTokenEqual(provided, expected);
    if (!isValid) {
      return fail(c, 401, 'UNAUTHENTICATED', 'Invalid bearer token');
    }

    await next();
  })

  // ---------------------------------------------------------------- 1. GET /api/internal/snapshot
  .get('/internal/snapshot', async (c) => {
    const db = getDb(c.env);
    const siteSettings = await getSiteSettings(c.env);
    const siteConfig = { url: runtimeOrigin(siteSettings, c.req.url) };

    const defaultLang: 'th' | 'en' = siteSettings?.default_lang === 'en' ? 'en' : 'th';
    const site = {
      name: 'Mossplan',
      description: 'บทความและข่าวสารที่อ่านง่าย เขียนด้วยข้อมูลที่ตรวจสอบได้',
      url: siteConfig.url,
      defaultLang,
    };

    // Categories
    const categories = await db
      .select({
        id: schema.category.id,
        slug: schema.category.slug,
        name: schema.category.name,
        description: schema.category.description,
        sortOrder: schema.category.sortOrder,
      })
      .from(schema.category)
      .orderBy(asc(schema.category.sortOrder));

    // Tags
    const tags = await db
      .select({
        id: schema.tag.id,
        slug: schema.tag.slug,
        name: schema.tag.name,
      })
      .from(schema.tag)
      .orderBy(asc(schema.tag.name));

    // Media
    const mediaRows = await db
      .select({
        id: schema.media.id,
        key: schema.media.r2Key,
        mime: schema.media.mime,
        width: schema.media.width,
        height: schema.media.height,
        alt: schema.media.alt,
      })
      .from(schema.media)
      .orderBy(asc(schema.media.createdAt));

    // Published articles only, newest first
    const publishedRows = await db
      .select()
      .from(schema.article)
      .where(eq(schema.article.status, 'published'))
      .orderBy(desc(schema.article.publishedAt));

    const articleIds = publishedRows.map((a) => a.id);

    // Fetch tag mappings for published articles
    const articleTagMap = new Map<string, string[]>();
    if (articleIds.length > 0) {
      const allTags = await db
        .select({
          articleId: schema.articleTag.articleId,
          tagId: schema.articleTag.tagId,
        })
        .from(schema.articleTag)
        .where(inArray(schema.articleTag.articleId, articleIds));

      for (const t of allTags) {
        const list = articleTagMap.get(t.articleId) ?? [];
        list.push(t.tagId);
        articleTagMap.set(t.articleId, list);
      }
    }

    // Authors: complete profiles of users who wrote or reviewed a published article
    const relevantUserIds = new Set<string>();
    for (const a of publishedRows) {
      if (a.authorId) relevantUserIds.add(a.authorId);
      if (a.reviewedBy) relevantUserIds.add(a.reviewedBy);
    }

    const completeAuthors: Snapshot['authors'] = [];
    if (relevantUserIds.size > 0) {
      const userRows = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          slug: schema.user.slug,
          jobTitle: schema.user.jobTitle,
          bio: schema.user.bio,
          avatarMediaId: schema.user.avatarMediaId,
          sameAsJson: schema.user.sameAsJson,
          knowsAboutJson: schema.user.knowsAboutJson,
        })
        .from(schema.user)
        .where(inArray(schema.user.id, Array.from(relevantUserIds)));

      for (const u of userRows) {
        if (isProfileComplete(u) && u.slug && u.jobTitle && u.bio) {
          const sameAs = parseJsonArray(u.sameAsJson).filter(isValidUrl);
          const knowsAbout = parseJsonArray(u.knowsAboutJson);
          completeAuthors.push({
            id: u.id,
            slug: u.slug,
            name: u.name,
            jobTitle: u.jobTitle,
            bio: u.bio,
            avatarMediaId: u.avatarMediaId,
            sameAs,
            knowsAbout,
          });
        }
      }
    }

    // 6. Fetch affiliate links for Snapshot v2 (D24, AFFILIATE §5)
    let affiliateLinks: Snapshot['affiliateLinks'] = [];
    const activeLinkIds = new Set<string>();
    try {
      const affRows = await db
        .select({
          id: affiliateSchema.affiliateLink.id,
          slug: affiliateSchema.affiliateLink.slug,
          status: affiliateSchema.affiliateLink.status,
          merchantName: affiliateSchema.merchant.name,
          merchantDomain: affiliateSchema.merchant.domain,
          trackingHostsJson: affiliateSchema.merchant.trackingHostsJson,
        })
        .from(affiliateSchema.affiliateLink)
        .innerJoin(
          affiliateSchema.merchant,
          eq(affiliateSchema.affiliateLink.merchantId, affiliateSchema.merchant.id),
        );

      affiliateLinks = affRows.map((r) => {
        let trackingHosts: string[] = [];
        try {
          trackingHosts = JSON.parse(r.trackingHostsJson || '[]');
        } catch {
          trackingHosts = [];
        }
        return {
          id: r.id,
          slug: r.slug,
          merchantName: r.merchantName,
          merchantHosts: [r.merchantDomain, ...trackingHosts],
          status: r.status as 'active' | 'paused' | 'broken',
        };
      });

      for (const r of affRows) {
        if (r.status === 'active') {
          activeLinkIds.add(r.id);
        }
      }
    } catch {
      affiliateLinks = [];
    }

    // Articles formatted
    const articles: Snapshot['articles'] = publishedRows.map((art) => {
      let content: unknown = { type: 'doc', content: [] };
      try {
        content = JSON.parse(art.contentJson);
      } catch {
        content = { type: 'doc', content: [] };
      }

      return {
        id: art.id,
        slug: art.slug,
        lang: art.lang === 'en' ? 'en' : 'th',
        translationGroupId: art.translationGroupId,
        title: art.title,
        excerpt: art.excerpt,
        content,
        coverMediaId: art.coverMediaId,
        categoryId: art.categoryId,
        tagIds: articleTagMap.get(art.id) ?? [],
        authorId: art.authorId,
        reviewerId: art.reviewedBy,
        reviewedAt: art.reviewedAt,
        publishedAt: art.publishedAt ?? art.createdAt,
        updatedAt: art.contentModifiedAt ?? art.publishedAt ?? art.createdAt,
        seo: {
          title: art.seoTitle ?? null,
          description: art.seoDescription ?? null,
        },
        hasAffiliate: hasActiveAffiliateMark(content, activeLinkIds),
      };
    });

    // Redirects
    const redirects = await db
      .select({
        from: schema.redirect.fromPath,
        to: schema.redirect.toPath,
      })
      .from(schema.redirect)
      .orderBy(asc(schema.redirect.createdAt));

    const snapshot: Snapshot = {
      version: 2,
      generatedAt: Date.now(),
      site,
      categories,
      tags,
      media: mediaRows,
      authors: completeAuthors,
      articles,
      affiliateLinks,
      redirects,
    };

    // Validate the snapshot before returning
    const parsed = SnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      console.error('[snapshot] generated invalid snapshot:', parsed.error.issues);
      return fail(c, 500, 'INVALID_SNAPSHOT', 'Generated snapshot failed schema validation');
    }

    return ok(c, parsed.data);
  })

  // ---------------------------------------------------------------- 2. GET /api/internal/media/:id
  .get('/internal/media/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);

    const [item] = await db
      .select({ r2Key: schema.media.r2Key, mime: schema.media.mime })
      .from(schema.media)
      .where(eq(schema.media.id, id))
      .limit(1);

    if (!item) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบไฟล์สื่อ');
    }

    const r2Object = await c.env.MEDIA.get(item.r2Key);
    if (!r2Object) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบไฟล์ใน R2 storage');
    }

    const headers = new Headers();
    if (typeof r2Object.writeHttpMetadata === 'function') {
      r2Object.writeHttpMetadata(headers);
    }
    if (r2Object.httpEtag) {
      headers.set('etag', r2Object.httpEtag);
    }
    headers.set('Content-Type', item.mime);
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(r2Object.body, { headers });
  })

  // ---------------------------------------------------------------- 3. POST /api/internal/builds/:id/status
  .post('/internal/builds/:id/status', async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);

    let bodyJson: unknown;
    try {
      bodyJson = await c.req.json();
    } catch {
      return fail(c, 400, 'INVALID_JSON', 'รูปแบบ JSON ไม่ถูกต้อง');
    }

    const parsed = BuildStatusUpdateSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return fail(
        c,
        422,
        'VALIDATION_FAILED',
        parsed.error.issues[0]?.message || 'ข้อมูลสถานะไม่ถูกต้อง',
      );
    }

    // Workers Builds has no build id to pass along, so it reports against the newest running build.
    const [existing] =
      id === 'latest'
        ? await db
            .select()
            .from(schema.build)
            .where(eq(schema.build.status, 'running'))
            .orderBy(desc(schema.build.requestedAt))
            .limit(1)
        : await db.select().from(schema.build).where(eq(schema.build.id, id)).limit(1);

    if (!existing) {
      return fail(c, 404, 'NOT_FOUND', 'ไม่พบข้อมูลการอัปเดตเว็บไซต์');
    }

    const { status, runUrl, error } = parsed.data;
    const now = Date.now();

    const updateData: Partial<typeof schema.build.$inferInsert> = {
      status,
    };

    if (runUrl) {
      updateData.runUrl = runUrl;
    }

    if (status === 'running') {
      if (!existing.startedAt) {
        updateData.startedAt = now;
      }
    } else if (status === 'succeeded' || status === 'failed') {
      updateData.finishedAt = now;
      if (status === 'failed') {
        updateData.error = error ?? 'Deployment failed';
      }
    }

    await db.update(schema.build).set(updateData).where(eq(schema.build.id, existing.id));

    return ok(c, { success: true });
  });
