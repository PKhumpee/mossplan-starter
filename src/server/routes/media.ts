// Media library routes (CONTRACTS §5, DESIGN §10.3, T09).
// R2 uploads, pure-JS image dimensions, 409 MEDIA_IN_USE check, streaming admin preview.
import { and, count, desc, eq, like, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireSession } from '../auth/guard';
import { getDb, recordAudit } from '../db';
import * as schema from '../db/schema';
import type { AppEnv } from '../http/types';
import { detectImageInfo } from '../../lib/media/image-info';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const patchMediaSchema = z.object({
  alt: z.string().trim().max(300, 'ข้อความแทนภาพยาวเกิน 300 ตัวอักษร'),
});

export const mediaRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------------- List media
  .get('/admin/media', requireSession, async (c) => {
    const db = getDb(c.env);
    const missingAlt = c.req.query('missingAlt') === 'true';
    const q = c.req.query('q')?.trim().toLowerCase();
    const page = Math.max(1, Number(c.req.query('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 24)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (missingAlt) {
      conditions.push(or(eq(schema.media.alt, ''), eq(schema.media.alt, ' ')));
    }
    if (q) {
      conditions.push(or(like(schema.media.filename, `%${q}%`), like(schema.media.alt, `%${q}%`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ total: count() }).from(schema.media).where(whereClause);
    const total = Number(totalRes?.total ?? 0);

    const rows = await db
      .select({
        id: schema.media.id,
        r2Key: schema.media.r2Key,
        filename: schema.media.filename,
        mime: schema.media.mime,
        bytes: schema.media.bytes,
        width: schema.media.width,
        height: schema.media.height,
        alt: schema.media.alt,
        uploadedBy: schema.media.uploadedBy,
        createdAt: schema.media.createdAt,
        uploaderName: schema.user.name,
      })
      .from(schema.media)
      .leftJoin(schema.user, eq(schema.media.uploadedBy, schema.user.id))
      .where(whereClause)
      .orderBy(desc(schema.media.createdAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map((r) => ({
      id: r.id,
      r2Key: r.r2Key,
      filename: r.filename,
      mime: r.mime,
      bytes: Number(r.bytes),
      width: r.width,
      height: r.height,
      alt: r.alt,
      uploadedBy: r.uploadedBy,
      uploaderName: r.uploaderName ?? null,
      createdAt: Number(r.createdAt),
      url: `/api/admin/media/${r.id}/file`,
    }));

    return c.json({
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  })

  // ---------------------------------------------------------------- Upload media
  .post('/admin/media', requireSession, async (c) => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json(
        { error: { code: 'INVALID_FORM_DATA', message: 'รูปแบบข้อมูลอัปโหลดไม่ถูกต้อง' } },
        400,
      );
    }

    const file = formData.get('file');
    if (
      !file ||
      typeof file === 'string' ||
      !(typeof file === 'object' && 'arrayBuffer' in file && 'size' in file)
    ) {
      return c.json(
        { error: { code: 'MISSING_FILE', message: 'กรุณาเลือกไฟล์ที่ต้องการอัปโหลด' } },
        400,
      );
    }

    const filename = (file as File).name || 'image';
    const alt =
      typeof formData.get('alt') === 'string' ? (formData.get('alt') as string).trim() : '';

    // File size check (max 10 MB)
    if (file.size > MAX_BYTES) {
      return c.json(
        {
          error: {
            code: 'FILE_TOO_LARGE',
            message: `ขนาดไฟล์เกินกำหนด (สูงสุด 10 MB)`,
          },
        },
        413,
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Validate type by magic bytes
    const info = detectImageInfo(buffer);
    if (!info) {
      return c.json(
        {
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'ประเภทไฟล์ไม่รองรับ ต้องเป็นรูปภาพ JPEG, PNG, WebP, AVIF หรือ GIF เท่านั้น',
          },
        },
        415,
      );
    }

    const mediaId = crypto.randomUUID();
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const r2Key = `media/${yyyy}/${mm}/${mediaId}.${info.extension}`;

    // Upload original to Cloudflare R2
    await c.env.MEDIA.put(r2Key, buffer, {
      httpMetadata: {
        contentType: info.mime,
      },
    });

    const db = getDb(c.env);
    const sessionUser = c.get('user');
    const timestamp = Date.now();

    await db.insert(schema.media).values({
      id: mediaId,
      r2Key,
      filename,
      mime: info.mime,
      bytes: buffer.length,
      width: info.width,
      height: info.height,
      alt,
      uploadedBy: sessionUser.id,
      createdAt: timestamp,
    });

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'media.upload',
      targetType: 'media',
      targetId: mediaId,
      meta: {
        filename,
        mime: info.mime,
        bytes: buffer.length,
        width: info.width,
        height: info.height,
      },
    });

    return c.json(
      {
        data: {
          id: mediaId,
          r2Key,
          filename,
          mime: info.mime,
          bytes: buffer.length,
          width: info.width,
          height: info.height,
          alt,
          uploadedBy: sessionUser.id,
          createdAt: timestamp,
          url: `/api/admin/media/${mediaId}/file`,
        },
      },
      201,
    );
  })

  // ---------------------------------------------------------------- Update media alt
  .patch('/admin/media/:id', requireSession, async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);
    const sessionUser = c.get('user');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
    }

    const parsed = patchMediaSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'ข้อมูลไม่ถูกต้อง',
          },
        },
        422,
      );
    }

    const [existing] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1);

    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบไฟล์สื่อที่ระบุ' } }, 404);
    }

    await db.update(schema.media).set({ alt: parsed.data.alt }).where(eq(schema.media.id, id));

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'media.update',
      targetType: 'media',
      targetId: id,
      meta: { oldAlt: existing.alt, newAlt: parsed.data.alt },
    });

    const [updated] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1);

    return c.json({
      data: {
        ...updated,
        url: `/api/admin/media/${id}/file`,
      },
    });
  })

  // ---------------------------------------------------------------- Delete media (409 MEDIA_IN_USE check)
  .delete('/admin/media/:id', requireSession, async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);
    const sessionUser = c.get('user');

    const [item] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1);

    if (!item) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบไฟล์สื่อที่ระบุ' } }, 404);
    }

    // 1. Check if used as article cover
    const [asCover] = await db
      .select({ total: count() })
      .from(schema.article)
      .where(eq(schema.article.coverMediaId, id));

    // 2. Check if used as user avatar
    const [asAvatar] = await db
      .select({ total: count() })
      .from(schema.user)
      .where(eq(schema.user.avatarMediaId, id));

    // 3. Check if used in article content JSON
    const [inContent] = await db
      .select({ total: count() })
      .from(schema.article)
      .where(like(schema.article.contentJson, `%${id}%`));

    const totalUsage =
      Number(asCover?.total ?? 0) + Number(asAvatar?.total ?? 0) + Number(inContent?.total ?? 0);

    if (totalUsage > 0) {
      return c.json(
        {
          error: {
            code: 'MEDIA_IN_USE',
            message: `ไม่สามารถลบไฟล์สื่อ "${item.filename}" ได้เนื่องจากกำลังถูกใช้งานอยู่ในระบบ (${totalUsage} จุด)`,
          },
        },
        409,
      );
    }

    // Delete from R2
    await c.env.MEDIA.delete(item.r2Key);

    // Delete from D1
    await db.delete(schema.media).where(eq(schema.media.id, id));

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'media.delete',
      targetType: 'media',
      targetId: id,
      meta: { filename: item.filename, r2Key: item.r2Key },
    });

    return c.json({ data: { success: true } });
  })

  // ---------------------------------------------------------------- Stream media file (admin preview)
  .get('/admin/media/:id/file', requireSession, async (c) => {
    const id = c.req.param('id');
    const db = getDb(c.env);

    const [item] = await db
      .select({ r2Key: schema.media.r2Key, mime: schema.media.mime })
      .from(schema.media)
      .where(eq(schema.media.id, id))
      .limit(1);

    if (!item) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบไฟล์สื่อ' } }, 404);
    }

    const r2Object = await c.env.MEDIA.get(item.r2Key);
    if (!r2Object) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบไฟล์ใน R2 storage' } }, 404);
    }

    const headers = new Headers();
    r2Object.writeHttpMetadata(headers);
    headers.set('etag', r2Object.httpEtag);
    headers.set('Content-Type', item.mime);
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(r2Object.body, { headers });
  });
