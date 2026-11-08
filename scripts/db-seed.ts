// `pnpm db:seed:local`: loads fixtures/content-snapshot.sample.json into the local D1 (the same
// persisted state `pnpm db:migrate:local` writes) plus an admin invite for ADMIN_EMAIL.
// Run `pnpm db:migrate:local` first. ADMIN_EMAIL comes from `.dev.vars` or the shell environment.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { SnapshotSchema } from '../src/shared/snapshot';
import { getDb } from '../src/server/db/client';
import { seedFromSnapshot } from '../src/server/db/seed';

const root = resolve(import.meta.dirname, '..');

function readAdminEmail(): string | undefined {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  const file = resolve(root, '.dev.vars');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*ADMIN_EMAIL\s*=/.test(l));
  return (
    line
      ?.split('=')
      .slice(1)
      .join('=')
      .trim()
      .replace(/^["']|["']$/g, '') || undefined
  );
}

const snapshot = SnapshotSchema.parse(
  JSON.parse(readFileSync(resolve(root, 'fixtures/content-snapshot.sample.json'), 'utf8')),
);
const adminEmail = readAdminEmail();
if (!adminEmail)
  console.warn(
    '[seed] ADMIN_EMAIL is not set in .dev.vars or the environment: no admin invite created',
  );

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: resolve(root, 'wrangler.jsonc'),
});
try {
  const db = getDb(proxy.env);
  const exists = await proxy.env.DB.prepare(
    "select name from sqlite_master where name = 'article'",
  ).first();
  if (!exists) throw new Error('Tables are missing. Run `pnpm db:migrate:local` first.');
  const result = await seedFromSnapshot(db, snapshot, { adminEmail });
  console.log('[seed] loaded', result);
  for (const table of [
    'user',
    'category',
    'tag',
    'media',
    'article',
    'article_tag',
    'redirect',
    'invite',
  ]) {
    const row = await proxy.env.DB.prepare(`select count(*) as n from "${table}"`).first<{
      n: number;
    }>();
    console.log(`[seed] ${table}: ${row?.n}`);
  }
} finally {
  await proxy.dispose();
}
