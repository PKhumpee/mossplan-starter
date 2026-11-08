// CLI script for D1 backup, restore, pruning, and verification (T18).
// Usage:
//   pnpm exec tsx scripts/backup.ts [backup] [--keep=12]
//   pnpm exec tsx scripts/backup.ts list
//   pnpm exec tsx scripts/backup.ts prune [--keep=12]
//   pnpm exec tsx scripts/backup.ts restore <file-or-key> [--target=local|remote]
//   pnpm exec tsx scripts/backup.ts verify-counts [--target=local|remote]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BACKUP_BUCKET_NAME,
  BACKUP_PREFIX,
  compressSql,
  D1_DATABASE_NAME,
  decompressSql,
  DEFAULT_RETENTION_COUNT,
  formatBackupKey,
  getAuthToken,
  getCloudflareAccountId,
  listRemoteBackups,
  prepareSqlForRestore,
  pruneRemoteBackups,
} from './lib/backup';

const root = resolve(import.meta.dirname, '..');
const tempDir = resolve(root, '.cache/backups');

export const KNOWN_TABLES = [
  'account',
  'affiliate_click',
  'affiliate_click_daily',
  'affiliate_conversion',
  'affiliate_link',
  'article',
  'article_tag',
  'audit_log',
  'build',
  'category',
  'd1_migrations',
  'invite',
  'media',
  'merchant',
  'page_stat_daily',
  'rate_limit',
  'redirect',
  'session',
  'tag',
  'user',
  'verification',
];

export async function runBackup(opts: {
  retentionCount?: number;
  skipPrune?: boolean;
}): Promise<{ backupKey: string; sizeBytes: number; deletedKeys: string[] }> {
  const retentionCount = opts.retentionCount ?? DEFAULT_RETENTION_COUNT;
  mkdirSync(tempDir, { recursive: true });

  const backupKey = formatBackupKey();
  const rawSqlPath = resolve(tempDir, `${backupKey.replace('.sql.gz', '')}.raw.sql`);
  const orderedSqlPath = resolve(tempDir, `${backupKey.replace('.sql.gz', '')}.ordered.sql`);
  const gzPath = resolve(tempDir, backupKey);

  console.log(`[backup] 1. Exporting remote D1 database '${D1_DATABASE_NAME}'...`);
  execSync(`npx wrangler d1 export ${D1_DATABASE_NAME} --remote --output="${rawSqlPath}" -y`, {
    cwd: root,
    stdio: 'inherit',
  });

  if (!existsSync(rawSqlPath)) {
    throw new Error(`Export failed: SQL file not found at ${rawSqlPath}`);
  }

  console.log(`[backup] 2. Preparing and ordering SQL statements for consistent restore...`);
  const rawSql = readFileSync(rawSqlPath, 'utf8');
  const preparedSql = prepareSqlForRestore(rawSql);
  writeFileSync(orderedSqlPath, preparedSql, 'utf8');

  console.log(`[backup] 3. Compressing SQL with gzip...`);
  const compressed = compressSql(preparedSql);
  writeFileSync(gzPath, compressed);
  const sizeBytes = compressed.byteLength;
  console.log(`[backup] Compressed size: ${(sizeBytes / 1024).toFixed(2)} KB`);

  console.log(`[backup] 4. Uploading to R2 bucket '${BACKUP_BUCKET_NAME}' as '${backupKey}'...`);
  execSync(
    `npx wrangler r2 object put "${BACKUP_BUCKET_NAME}/${backupKey}" --file="${gzPath}" --remote`,
    { cwd: root, stdio: 'inherit' },
  );

  let deletedKeys: string[] = [];
  if (!opts.skipPrune) {
    console.log(`[backup] 5. Checking backup retention (keeping last ${retentionCount})...`);
    const token = getAuthToken();
    const accountId = getCloudflareAccountId(root);

    if (token) {
      const pruneResult = await pruneRemoteBackups({
        accountId,
        bucketName: BACKUP_BUCKET_NAME,
        apiToken: token,
        keepCount: retentionCount,
      });
      deletedKeys = pruneResult.deleted;
      if (deletedKeys.length > 0) {
        console.log(`[backup] Pruned ${deletedKeys.length} older backup(s):`, deletedKeys);
      } else {
        console.log(`[backup] Retention check passed: total backups <= ${retentionCount}.`);
      }
    } else {
      console.warn(
        `[backup] Warning: Could not resolve Cloudflare API token; skipped remote pruning.`,
      );
    }
  }

  // Cleanup temporary files
  console.log(`[backup] 6. Cleaning up temporary files...`);
  rmSync(rawSqlPath, { force: true });
  rmSync(orderedSqlPath, { force: true });
  rmSync(gzPath, { force: true });

  console.log(`[backup] Backup completed successfully: ${backupKey}`);
  return { backupKey, sizeBytes, deletedKeys };
}

export async function runList(): Promise<void> {
  const token = getAuthToken();
  const accountId = getCloudflareAccountId(root);

  if (!token) {
    throw new Error('Authentication token required to list remote R2 backups.');
  }

  const objects = await listRemoteBackups({
    accountId,
    bucketName: BACKUP_BUCKET_NAME,
    apiToken: token,
    prefix: BACKUP_PREFIX,
  });

  console.log(`[list] Found ${objects.length} backup(s) in R2 bucket '${BACKUP_BUCKET_NAME}':`);
  const sorted = [...objects].sort((a, b) => b.key.localeCompare(a.key));
  for (const obj of sorted) {
    const kb = (obj.size / 1024).toFixed(2);
    console.log(`  - ${obj.key} (${kb} KB, modified: ${obj.last_modified})`);
  }
}

export async function runPrune(keepCount: number = DEFAULT_RETENTION_COUNT): Promise<void> {
  const token = getAuthToken();
  const accountId = getCloudflareAccountId(root);

  if (!token) {
    throw new Error('Authentication token required to prune remote R2 backups.');
  }

  console.log(`[prune] Pruning R2 bucket '${BACKUP_BUCKET_NAME}' to keep last ${keepCount}...`);
  const res = await pruneRemoteBackups({
    accountId,
    bucketName: BACKUP_BUCKET_NAME,
    apiToken: token,
    keepCount,
  });

  console.log(
    `[prune] Kept ${res.kept.length} backup(s). Deleted ${res.deleted.length} older backup(s).`,
  );
  for (const k of res.deleted) {
    console.log(`  Deleted: ${k}`);
  }
}

export async function runRestore(opts: {
  source: string;
  target: 'local' | 'remote';
  cleanLocal?: boolean;
}): Promise<void> {
  const { source, target } = opts;
  mkdirSync(tempDir, { recursive: true });

  let localFile = source;

  // If source is a key in R2 or not a local file, download it first
  if (!existsSync(source) || source.startsWith(BACKUP_PREFIX)) {
    const key = source.includes('/') ? source.split('/').pop()! : source;
    console.log(`[restore] Downloading '${key}' from R2 bucket '${BACKUP_BUCKET_NAME}'...`);
    localFile = resolve(tempDir, key);
    execSync(
      `npx wrangler r2 object get "${BACKUP_BUCKET_NAME}/${key}" --file="${localFile}" --remote`,
      { cwd: root, stdio: 'inherit' },
    );
  }

  if (!existsSync(localFile)) {
    throw new Error(`Restore failed: file not found at ${localFile}`);
  }

  // Decompress if gzipped
  let sqlContent: string;
  if (localFile.endsWith('.gz')) {
    console.log(`[restore] Decompressing gzip archive...`);
    const buffer = readFileSync(localFile);
    sqlContent = decompressSql(buffer);
  } else {
    sqlContent = readFileSync(localFile, 'utf8');
  }

  // Prepare and order statements
  console.log(`[restore] Ordering SQL statements for clean restore...`);
  const preparedSql = prepareSqlForRestore(sqlContent);
  const restoreSqlPath = resolve(tempDir, 'restore.prepared.sql');
  writeFileSync(restoreSqlPath, preparedSql, 'utf8');

  // If local target and cleanLocal requested, reset local state first
  if (target === 'local' && opts.cleanLocal) {
    console.log(`[restore] Resetting local D1 state before restore...`);
    const localD1Path = resolve(root, '.wrangler/state/v3/d1');
    rmSync(localD1Path, { recursive: true, force: true });
  }

  console.log(`[restore] Executing restore into ${target} D1 database '${D1_DATABASE_NAME}'...`);
  const targetFlag = target === 'remote' ? '--remote' : '--local';
  execSync(
    `npx wrangler d1 execute ${D1_DATABASE_NAME} ${targetFlag} --file="${restoreSqlPath}" -y`,
    { cwd: root, stdio: 'inherit' },
  );

  rmSync(restoreSqlPath, { force: true });
  console.log(`[restore] Successfully restored database into ${target} D1.`);
}

export async function getTableRowCounts(
  target: 'local' | 'remote',
  tables: string[] = KNOWN_TABLES,
): Promise<Record<string, number>> {
  const targetFlag = target === 'remote' ? '--remote' : '--local';
  const counts: Record<string, number> = {};

  // Query in chunks of 5 to avoid SQLite compound query limit
  for (let i = 0; i < tables.length; i += 5) {
    const chunk = tables.slice(i, i + 5);
    const sql = chunk
      .map((t) => `SELECT '${t}' as tbl, count(*) as cnt FROM "${t}"`)
      .join(' UNION ALL ');

    try {
      const out = execSync(
        `npx wrangler d1 execute ${D1_DATABASE_NAME} ${targetFlag} --command="${sql}" --json`,
        { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
      );
      const parsed = JSON.parse(out);
      const results = parsed[0]?.results || [];
      for (const r of results) {
        counts[r.tbl] = Number(r.cnt);
      }
    } catch {
      // Table may not exist yet in target
      for (const t of chunk) {
        counts[t] = -1; // indicates missing table
      }
    }
  }

  return counts;
}

// CLI entry point
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'backup';

  const keepArg = args.find((a) => a.startsWith('--keep='));
  const retentionCount = keepArg ? Number(keepArg.split('=')[1]) : DEFAULT_RETENTION_COUNT;

  const targetArg = args.find((a) => a.startsWith('--target='));
  const target = targetArg?.split('=')[1] === 'remote' ? 'remote' : 'local';

  if (command === 'backup') {
    await runBackup({ retentionCount });
  } else if (command === 'list') {
    await runList();
  } else if (command === 'prune') {
    await runPrune(retentionCount);
  } else if (command === 'restore') {
    const fileOrKey = args[1];
    if (!fileOrKey) {
      console.error('Usage: tsx scripts/backup.ts restore <file-or-key> [--target=local|remote]');
      process.exit(1);
    }
    const cleanLocal = !args.includes('--no-clean');
    await runRestore({ source: fileOrKey, target, cleanLocal });
  } else if (command === 'verify-counts') {
    console.log(`[verify-counts] Querying row counts for ${target} D1...`);
    const counts = await getTableRowCounts(target);
    console.log(JSON.stringify(counts, null, 2));
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Available commands: backup, list, prune, restore, verify-counts');
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((err) => {
    console.error('[backup] Error:', err);
    process.exit(1);
  });
}
