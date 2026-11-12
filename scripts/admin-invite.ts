// CLI script to invite or grant admin role to an email address (CONTRACTS §4).
// Usage: pnpm admin:invite <email> [--remote]
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import * as schema from '../src/server/db/schema';

const root = resolve(import.meta.dirname, '..');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isRemote = args.includes('--remote');
  const emailArg = args.find((a) => !a.startsWith('--'));

  if (!emailArg) {
    console.error('การใช้งาน: pnpm admin:invite <email> [--remote]');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  if (!email.includes('@') || !email.includes('.')) {
    console.error('รูปแบบอีเมลไม่ถูกต้อง:', email);
    process.exit(1);
  }

  if (isRemote) {
    console.log(`[admin-invite] กำลังเพิ่มคำเชิญแอดมินสำหรับ ${email} บน Remote D1...`);
    const now = Date.now();
    const id = crypto.randomUUID();
    const escapedEmail = email.replace(/'/g, "''");

    const sql = `
      INSERT INTO invite (id, email, role, created_at)
      VALUES ('${id}', '${escapedEmail}', 'admin', ${now})
      ON CONFLICT(email) DO UPDATE SET role = 'admin', accepted_at = NULL;
      UPDATE user SET role = 'admin' WHERE email = '${escapedEmail}' AND role != 'owner';
    `
      .trim()
      .replace(/\n\s*/g, ' ');

    try {
      execSync(`npx wrangler d1 execute DB --remote --command="${sql}"`, {
        cwd: root,
        stdio: 'inherit',
      });
      console.log(
        `[admin-invite] สำเร็จ: บันทึกสิทธิ์ admin สำหรับ ${email} บน Remote D1 เรียบร้อย`,
      );
    } catch (err) {
      console.error('[admin-invite] เกิดข้อผิดพลาดในการรันคำสั่งบน Cloudflare D1:', err);
      process.exit(1);
    }
  } else {
    console.log(`[admin-invite] กำลังเพิ่มคำเชิญแอดมินสำหรับ ${email} บน Local D1...`);
    const proxy = await getPlatformProxy<{ DB: D1Database }>({
      configPath: resolve(root, 'wrangler.jsonc'),
    });

    try {
      const db = getDb(proxy.env);
      const [existingInvite] = await db
        .select()
        .from(schema.invite)
        .where(eq(schema.invite.email, email))
        .limit(1);

      if (existingInvite) {
        await db
          .update(schema.invite)
          .set({ role: 'admin', acceptedAt: null })
          .where(eq(schema.invite.email, email));
      } else {
        await db.insert(schema.invite).values({
          id: crypto.randomUUID(),
          email,
          role: 'admin',
          createdAt: Date.now(),
        });
      }

      // Also ensure role='admin' in user table if user already exists
      await db
        .update(schema.user)
        .set({ role: 'admin' })
        .where(and(eq(schema.user.email, email), ne(schema.user.role, 'owner')));

      console.log(
        `[admin-invite] สำเร็จ: บันทึกสิทธิ์ admin สำหรับ ${email} บน Local D1 เรียบร้อย`,
      );
    } finally {
      await proxy.dispose();
    }
  }
}

main().catch((err) => {
  console.error('[admin-invite] ล้มเหลว:', err);
  process.exit(1);
});
