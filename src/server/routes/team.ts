// Team management & Audit log routes (CONTRACTS §5, DESIGN §10.5).
// GET/POST/PATCH/DELETE /api/admin/team/*, GET /api/admin/audit (admin only).
import { and, count, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, requireSession } from '../auth/guard';
import { getDb, recordAudit } from '../db';
import * as schema from '../db/schema';
import { isProfileComplete } from '../db/profile';
import type { AppEnv } from '../http/types';

const inviteSchema = z.object({
  email: z.string().trim().email({ message: 'รูปแบบอีเมลไม่ถูกต้อง' }),
  role: z.enum(['admin', 'editor']).default('editor'),
});

const roleUpdateSchema = z.object({
  role: z.enum(['admin', 'editor'], {
    error: 'บทบาทต้องเป็น admin หรือ editor เท่านั้น',
  }),
});

export const teamRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------------- Team routes (admin only)
  // List team members and pending invites (GET /api/admin/team)
  .get('/admin/team', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);

    // 1. Fetch all users
    const users = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        role: schema.user.role,
        slug: schema.user.slug,
        jobTitle: schema.user.jobTitle,
        bio: schema.user.bio,
        avatarMediaId: schema.user.avatarMediaId,
        createdAt: schema.user.createdAt,
      })
      .from(schema.user)
      .orderBy(desc(schema.user.createdAt));

    // 2. Fetch latest session per user for lastSignInAt
    const sessions = await db
      .select({
        userId: schema.session.userId,
        createdAt: schema.session.createdAt,
      })
      .from(schema.session)
      .orderBy(desc(schema.session.createdAt));

    const lastSignInMap = new Map<string, number>();
    for (const s of sessions) {
      if (!lastSignInMap.has(s.userId)) {
        const time = s.createdAt instanceof Date ? s.createdAt.getTime() : Number(s.createdAt);
        lastSignInMap.set(s.userId, time);
      }
    }

    const formattedUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      slug: u.slug,
      jobTitle: u.jobTitle,
      bio: u.bio,
      avatarMediaId: u.avatarMediaId,
      complete: isProfileComplete(u),
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : Number(u.createdAt),
      lastSignInAt: lastSignInMap.get(u.id) ?? null,
    }));

    // 3. Fetch pending invites
    const invites = await db
      .select({
        id: schema.invite.id,
        email: schema.invite.email,
        role: schema.invite.role,
        invitedBy: schema.invite.invitedBy,
        createdAt: schema.invite.createdAt,
        inviterName: schema.user.name,
      })
      .from(schema.invite)
      .leftJoin(schema.user, eq(schema.invite.invitedBy, schema.user.id))
      .where(isNull(schema.invite.acceptedAt))
      .orderBy(desc(schema.invite.createdAt));

    const formattedInvites = invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      invitedByName: inv.inviterName ?? null,
      createdAt: Number(inv.createdAt),
    }));

    return c.json({
      data: {
        users: formattedUsers,
        invites: formattedInvites,
      },
    });
  })

  // Create an invite (POST /api/admin/team/invites)
  .post('/admin/team/invites', requireSession, requireRole('admin'), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
    }

    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'ข้อมูลคำเชิญไม่ถูกต้อง',
          },
        },
        422,
      );
    }

    const email = parsed.data.email.toLowerCase();
    const role = parsed.data.role;
    const sessionUser = c.get('user');
    const db = getDb(c.env);

    // Guard: Check if user already exists
    const [existingUser] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);

    if (existingUser) {
      return c.json(
        {
          error: {
            code: 'USER_EXISTS',
            message: `มีผู้ใช้งานด้วยอีเมล ${email} ในระบบแล้ว`,
          },
        },
        409,
      );
    }

    // Guard: Check if pending invite already exists
    const [existingInvite] = await db
      .select({ id: schema.invite.id })
      .from(schema.invite)
      .where(and(eq(schema.invite.email, email), isNull(schema.invite.acceptedAt)))
      .limit(1);

    if (existingInvite) {
      return c.json(
        {
          error: {
            code: 'INVITE_EXISTS',
            message: `มีคำเชิญสำหรับอีเมล ${email} อยู่แล้ว และยังไม่ได้รับการตอบรับ`,
          },
        },
        409,
      );
    }

    const inviteId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.invite).values({
      id: inviteId,
      email,
      role,
      invitedBy: sessionUser.id,
      createdAt: now,
      acceptedAt: null,
    });

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'team.invite',
      targetType: 'invite',
      targetId: inviteId,
      meta: { email, role },
    });

    return c.json(
      {
        data: {
          id: inviteId,
          email,
          role,
          invitedBy: sessionUser.id,
          createdAt: now,
        },
      },
      201,
    );
  })

  // Revoke an invite (DELETE /api/admin/team/invites/:id)
  .delete('/admin/team/invites/:id', requireSession, requireRole('admin'), async (c) => {
    const inviteId = c.req.param('id');
    const sessionUser = c.get('user');
    const db = getDb(c.env);

    const [invite] = await db
      .select()
      .from(schema.invite)
      .where(and(eq(schema.invite.id, inviteId), isNull(schema.invite.acceptedAt)))
      .limit(1);

    if (!invite) {
      return c.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'ไม่พบคำเชิญที่ระบุ หรือคำเชิญถูกตอบรับไปแล้ว',
          },
        },
        404,
      );
    }

    await db.delete(schema.invite).where(eq(schema.invite.id, inviteId));

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'team.invite_revoke',
      targetType: 'invite',
      targetId: inviteId,
      meta: { email: invite.email },
    });

    return c.json({ data: { success: true } });
  })

  // Change user role (PATCH /api/admin/team/users/:id)
  .patch('/admin/team/users/:id', requireSession, requireRole('admin'), async (c) => {
    const targetUserId = c.req.param('id');
    const sessionUser = c.get('user');
    const db = getDb(c.env);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' } }, 400);
    }

    const parsed = roleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message || 'ข้อมูลบทบาทไม่ถูกต้อง',
          },
        },
        422,
      );
    }

    const [targetUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้ที่ระบุ' } }, 404);
    }

    const newRole = parsed.data.role;

    // Guard: Cannot demote the last admin
    if (targetUser.role === 'owner') {
      return c.json(
        { error: { code: 'OWNER_PROTECTED', message: 'เปลี่ยนบทบาท owner ไม่ได้' } },
        422,
      );
    }

    if (targetUser.role === 'admin' && newRole === 'editor') {
      const [adminCount] = await db
        .select({ total: count() })
        .from(schema.user)
        .where(inArray(schema.user.role, ['admin', 'owner']));

      if (Number(adminCount?.total ?? 0) <= 1) {
        return c.json(
          {
            error: {
              code: 'LAST_ADMIN',
              message:
                'ต้องมีผู้ดูแลระบบ (Admin) อย่างน้อย 1 คน ไม่สามารถลดระดับผู้ดูแลระบบคนสุดท้ายได้',
            },
          },
          422,
        );
      }
    }

    await db.update(schema.user).set({ role: newRole }).where(eq(schema.user.id, targetUserId));

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'team.role_change',
      targetType: 'user',
      targetId: targetUserId,
      meta: {
        oldRole: targetUser.role,
        newRole,
      },
    });

    return c.json({
      data: {
        id: targetUserId,
        email: targetUser.email,
        name: targetUser.name,
        role: newRole,
      },
    });
  })

  // Remove a user (DELETE /api/admin/team/users/:id)
  .delete('/admin/team/users/:id', requireSession, requireRole('admin'), async (c) => {
    const targetUserId = c.req.param('id');
    const sessionUser = c.get('user');
    const db = getDb(c.env);

    // Guard 1: Cannot remove yourself
    if (targetUserId === sessionUser.id) {
      const [self] = await db
        .select({ role: schema.user.role })
        .from(schema.user)
        .where(eq(schema.user.id, targetUserId))
        .limit(1);
      if (self?.role === 'owner') {
        return c.json({ error: { code: 'OWNER_PROTECTED', message: 'ลบ owner ไม่ได้' } }, 422);
      }
      return c.json(
        {
          error: {
            code: 'CANNOT_REMOVE_SELF',
            message: 'คุณไม่สามารถลบบัญชีของตัวเองได้',
          },
        },
        422,
      );
    }

    const [targetUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'ไม่พบผู้ใช้ที่ระบุ' } }, 404);
    }

    if (targetUser.role === 'owner') {
      return c.json({ error: { code: 'OWNER_PROTECTED', message: 'ลบ owner ไม่ได้' } }, 422);
    }

    // Guard 2: Cannot remove the last admin
    if (targetUser.role === 'admin') {
      const [adminCount] = await db
        .select({ total: count() })
        .from(schema.user)
        .where(inArray(schema.user.role, ['admin', 'owner']));

      if (Number(adminCount?.total ?? 0) <= 1) {
        return c.json(
          {
            error: {
              code: 'LAST_ADMIN',
              message: 'ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้ ต้องมี Admin เหลืออย่างน้อย 1 คน',
            },
          },
          422,
        );
      }
    }

    // Guard 3: Cannot remove author with articles (foreign key constraint without cascade)
    const [articlesCount] = await db
      .select({ total: count() })
      .from(schema.article)
      .where(eq(schema.article.authorId, targetUserId));

    if (Number(articlesCount?.total ?? 0) > 0) {
      return c.json(
        {
          error: {
            code: 'USER_HAS_ARTICLES',
            message: 'ไม่สามารถลบผู้ใช้ที่มีบทความในระบบได้ กรุณาลบหรือเปลี่ยนผู้เขียนบทความก่อน',
          },
        },
        409,
      );
    }

    // Delete user's sessions and account entries, then user
    await db.delete(schema.session).where(eq(schema.session.userId, targetUserId));
    await db.delete(schema.account).where(eq(schema.account.userId, targetUserId));
    await db.delete(schema.user).where(eq(schema.user.id, targetUserId));

    await recordAudit(db, {
      actorId: sessionUser.id,
      action: 'team.remove',
      targetType: 'user',
      targetId: targetUserId,
      meta: {
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
      },
    });

    return c.json({ data: { success: true } });
  })

  // ---------------------------------------------------------------- Audit log routes (admin only)
  // List audit logs (GET /api/admin/audit)
  .get('/admin/audit', requireSession, requireRole('admin'), async (c) => {
    const db = getDb(c.env);
    const actorId = c.req.query('actorId');
    const action = c.req.query('action');
    const fromStr = c.req.query('from');
    const toStr = c.req.query('to');
    const page = Math.max(1, Number(c.req.query('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 20)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (actorId) conditions.push(eq(schema.auditLog.actorId, actorId));
    if (action) conditions.push(eq(schema.auditLog.action, action));
    if (fromStr) {
      const fromTime = Number(fromStr);
      if (!isNaN(fromTime)) conditions.push(gte(schema.auditLog.createdAt, fromTime));
    }
    if (toStr) {
      const toTime = Number(toStr);
      if (!isNaN(toTime)) conditions.push(lte(schema.auditLog.createdAt, toTime));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total matching logs
    const [totalRes] = await db.select({ total: count() }).from(schema.auditLog).where(whereClause);
    const total = Number(totalRes?.total ?? 0);

    // Fetch items with actor info
    const logs = await db
      .select({
        id: schema.auditLog.id,
        actorId: schema.auditLog.actorId,
        action: schema.auditLog.action,
        targetType: schema.auditLog.targetType,
        targetId: schema.auditLog.targetId,
        metaJson: schema.auditLog.metaJson,
        createdAt: schema.auditLog.createdAt,
        actorName: schema.user.name,
        actorEmail: schema.user.email,
      })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id))
      .where(whereClause)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(limit)
      .offset(offset);

    const items = logs.map((log) => {
      let meta: unknown = null;
      if (log.metaJson) {
        try {
          meta = JSON.parse(log.metaJson);
        } catch {
          meta = null;
        }
      }

      return {
        id: log.id,
        actorId: log.actorId,
        actorName: log.actorName ?? null,
        actorEmail: log.actorEmail ?? null,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        meta,
        createdAt: Number(log.createdAt),
      };
    });

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
  });
