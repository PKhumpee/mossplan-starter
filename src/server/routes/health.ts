import { Hono } from 'hono';
import type { Env } from '../env';
import { applyMigrationSql } from '../db/migrations';

type Migration = { id: string; sql: string };
const bundledMigrations = import.meta.glob('/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const migrations: Migration[] = Object.entries(bundledMigrations)
  .map(([path, sql]) => ({
    id: path
      .split('/')
      .at(-1)!
      .replace(/\.sql$/, ''),
    sql,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

async function checksum(sql: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sql));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function tableExists(db: D1Database, table: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first<{ found: number }>();
  return Boolean(row);
}

async function tablesExist(db: D1Database, tables: string[]): Promise<boolean> {
  for (const table of tables) {
    if (!(await tableExists(db, table))) return false;
  }
  return true;
}

async function hasBaseline(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('user','article','setting','affiliate_link')",
    )
    .first<{ count: number }>();
  return row?.count === 4;
}

async function runMigrationsUnlocked(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS moss_migrations (
    id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL
  )`,
    )
    .run();
  const migrationRows = await Promise.all(
    migrations.map(async (migration) => ({
      ...migration,
      checksum: await checksum(migration.sql),
    })),
  );

  // Adopt installations created by the previous Wrangler migration set without replaying its SQL.
  if (
    !(await db.prepare('SELECT 1 FROM moss_migrations LIMIT 1').first()) &&
    (await hasBaseline(db))
  ) {
    for (const migration of migrationRows) {
      const covered =
        migration.id === '0000_baseline' ||
        (migration.id === '0003_runtime_site_settings' &&
          (await tableExists(db, 'site_settings'))) ||
        (migration.id === '0004_setup_api' &&
          (await tablesExist(db, ['setup_state', 'setup_attempts', 'setup_sessions', 'secrets'])));
      if (covered) {
        await db
          .prepare(
            'INSERT OR IGNORE INTO moss_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
          )
          .bind(migration.id, migration.checksum, Date.now())
          .run();
      }
    }
  }

  for (const migration of migrationRows) {
    const applied = await db
      .prepare('SELECT checksum FROM moss_migrations WHERE id = ?')
      .bind(migration.id)
      .first<{ checksum: string }>();
    if (applied) {
      if (applied.checksum !== migration.checksum) throw new Error('Migration checksum mismatch');
      continue;
    }
    await applyMigrationSql(db, migration.sql);
    await db
      .prepare('INSERT INTO moss_migrations (id, checksum, applied_at) VALUES (?, ?, ?)')
      .bind(migration.id, migration.checksum, Date.now())
      .run();
  }
}

async function runMigrations(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS moss_migration_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1), owner TEXT NOT NULL, expires_at INTEGER NOT NULL
  )`,
    )
    .run();
  const owner = crypto.randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO moss_migration_lock (id, owner, expires_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
        WHERE moss_migration_lock.expires_at < ?`,
      )
      .bind(owner, now + 30_000, now)
      .run();
    const row = await db
      .prepare('SELECT owner FROM moss_migration_lock WHERE id = 1')
      .first<{ owner: string }>();
    if (row?.owner === owner) {
      acquired = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!acquired) throw new Error('Migration lock unavailable');
  try {
    await runMigrationsUnlocked(db);
  } finally {
    await db
      .prepare('DELETE FROM moss_migration_lock WHERE id = 1 AND owner = ?')
      .bind(owner)
      .run();
  }
}

const migrationRuns = new WeakMap<D1Database, Promise<void>>();

export function ensureMigrationsOnce(db: D1Database): Promise<void> {
  let migrationRun = migrationRuns.get(db);
  if (!migrationRun) {
    migrationRun = runMigrations(db).catch((error: unknown) => {
      migrationRuns.delete(db);
      throw error;
    });
    migrationRuns.set(db, migrationRun);
  }
  return migrationRun;
}

export const healthRoutes = new Hono<{ Bindings: Env }>().get('/health', async (c) => {
  let database: 'ok' | 'error' = 'error';
  let objectStorage: 'ok' | 'error' = 'error';
  let schemaVersion = 'unknown';
  try {
    const db = c.env.DB;
    await db.prepare('SELECT 1').first();
    const latest = await db
      .prepare('SELECT id FROM moss_migrations ORDER BY id DESC LIMIT 1')
      .first<{ id: string }>();
    schemaVersion = latest?.id ?? '0';
    database = 'ok';
  } catch {
    // Keep infrastructure errors and configuration details out of the public response.
  }
  try {
    await c.env.MEDIA.list({ limit: 1 });
    objectStorage = 'ok';
  } catch {
    // Keep infrastructure errors and configuration details out of the public response.
  }
  const healthy = database === 'ok' && objectStorage === 'ok';
  return c.json(
    {
      status: healthy ? 'ok' : 'error',
      bindings: { d1: database, r2: objectStorage },
      schemaVersion,
    },
    healthy ? 200 : 503,
  );
});
