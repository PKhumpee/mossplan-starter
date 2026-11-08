// Test helper: applies every file in migrations/ to a D1 database inside the workers pool.
// Other tasks import `applyMigrations` in their own server tests.
import { applyMigrationSql } from './migrations';
const files = import.meta.glob('/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export async function applyMigrations(d1: D1Database): Promise<void> {
  for (const path of Object.keys(files).sort()) {
    await applyMigrationSql(d1, files[path]!);
  }
}
