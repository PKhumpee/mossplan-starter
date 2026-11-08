import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parse } from 'jsonc-parser';

export const BACKUP_PREFIX = 'mossplan-backup-';
export const DEFAULT_RETENTION_COUNT = 12;
export const BACKUP_BUCKET_NAME = 'mossplan-backups';
export const D1_DATABASE_NAME = 'DB';

export interface R2ObjectItem {
  key: string;
  size: number;
  last_modified: string;
  etag?: string;
}

/**
 * Splits a SQL string into individual top-level statements while correctly
 * handling string literals (single quotes, double quotes, backticks),
 * single-line comments (--), and multi-line comments (/* ... * /).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = i + 1 < sql.length ? sql[i + 1] : '';
    const prevChar = i > 0 ? sql[i - 1] : '';

    // Handle line comments
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    // Handle block comments
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    // Handle string / identifier quotes
    if (inSingleQuote) {
      if (char === "'" && prevChar !== '\\') {
        inSingleQuote = false;
      }
      current += char;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"' && prevChar !== '\\') {
        inDoubleQuote = false;
      }
      current += char;
      continue;
    }

    if (inBacktick) {
      if (char === '`' && prevChar !== '\\') {
        inBacktick = false;
      }
      current += char;
      continue;
    }

    // Check for comment starts
    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // Check for string starts
    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === '`') {
      inBacktick = true;
      current += char;
      continue;
    }

    // Check for statement terminator
    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const remaining = current.trim();
  if (remaining.length > 0) {
    statements.push(remaining);
  }

  return statements;
}

/**
 * Categorizes and reorders SQL statements so that:
 * 1. PRAGMAs are executed first (e.g. PRAGMA defer_foreign_keys=TRUE)
 * 2. All CREATE TABLE statements are executed
 * 3. All CREATE INDEX / CREATE UNIQUE INDEX statements are executed
 * 4. All INSERT INTO statements are executed
 * 5. Any remaining statements
 *
 * This prevents SQLite foreign key check failures during dump restoration
 * caused by alphabetical table dump order where tables referencing other
 * tables are populated before referenced tables exist.
 */
export function orderSqlStatements(statements: string[]): string[] {
  const pragmas: string[] = [];
  const creates: string[] = [];
  const indexes: string[] = [];
  const inserts: string[] = [];
  const others: string[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (/^PRAGMA\s+/i.test(trimmed)) {
      pragmas.push(trimmed);
    } else if (/^CREATE\s+TABLE\s+/i.test(trimmed)) {
      creates.push(trimmed);
    } else if (/^CREATE\s+(UNIQUE\s+)?INDEX\s+/i.test(trimmed)) {
      indexes.push(trimmed);
    } else if (/^INSERT\s+INTO\s+/i.test(trimmed)) {
      inserts.push(trimmed);
    } else {
      others.push(trimmed);
    }
  }

  // Ensure PRAGMA defer_foreign_keys=TRUE is present if not already
  const hasDefer = pragmas.some((p) => /defer_foreign_keys\s*=\s*(TRUE|ON|1)/i.test(p));
  const orderedPragmas = hasDefer ? pragmas : ['PRAGMA defer_foreign_keys=TRUE', ...pragmas];

  return [...orderedPragmas, ...creates, ...indexes, ...inserts, ...others];
}

/**
 * Prepares raw exported SQL for safe, order-independent restoration.
 */
export function prepareSqlForRestore(rawSql: string): string {
  const stmts = splitSqlStatements(rawSql);
  const ordered = orderSqlStatements(stmts);
  return ordered.map((s) => (s.endsWith(';') ? s : s + ';')).join('\n') + '\n';
}

/**
 * Compresses raw SQL string with gzip.
 */
export function compressSql(sql: string): Buffer {
  return gzipSync(Buffer.from(sql, 'utf8'));
}

/**
 * Decompresses gzipped buffer back to UTF-8 SQL string.
 */
export function decompressSql(gzBuffer: Buffer): string {
  return gunzipSync(gzBuffer).toString('utf8');
}

/**
 * Generates standardized backup key with UTC timestamp:
 * mossplan-backup-YYYY-MM-DD-HHmmss.sql.gz
 */
export function formatBackupKey(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${BACKUP_PREFIX}${yyyy}-${mm}-${dd}-${hh}${min}${ss}.sql.gz`;
}

/**
 * Parses timestamp from a backup key if valid, or returns null.
 */
export function parseBackupKeyDate(key: string): Date | null {
  const match = key.match(
    /^mossplan-backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.sql\.gz$/,
  );
  if (!match) return null;
  const [, y, m, d, hh, min, ss] = match;
  return new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(min), Number(ss)),
  );
}

/**
 * Given a list of backup keys, sorts them newest first and divides them
 * into keys to keep (first keepCount) and keys to prune (beyond keepCount).
 */
export function selectBackupsToPrune(
  keys: string[],
  keepCount: number = DEFAULT_RETENTION_COUNT,
): { keep: string[]; prune: string[] } {
  // Sort descending by key (lexicographical sorting matches chronological sorting with ISO timestamps)
  const sorted = [...keys].sort((a, b) => b.localeCompare(a));
  const keep = sorted.slice(0, keepCount);
  const prune = sorted.slice(keepCount);
  return { keep, prune };
}

/**
 * Resolves Cloudflare Account ID from environment or wrangler.jsonc.
 */
export function getCloudflareAccountId(rootPath: string = process.cwd()): string {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    return process.env.CLOUDFLARE_ACCOUNT_ID;
  }
  const wranglerPath = resolve(rootPath, 'wrangler.jsonc');
  if (existsSync(wranglerPath)) {
    try {
      const config = parse(readFileSync(wranglerPath, 'utf8')) as {
        vars?: { CF_ACCOUNT_ID?: string };
      };
      if (config?.vars?.CF_ACCOUNT_ID) {
        return config.vars.CF_ACCOUNT_ID;
      }
    } catch {
      // Report missing configuration below.
    }
  }
  throw new Error('Set CLOUDFLARE_ACCOUNT_ID or wrangler.jsonc vars.CF_ACCOUNT_ID before backup');
}

/**
 * Resolves Cloudflare API / OAuth token.
 * Checks CLOUDFLARE_API_TOKEN environment variable first.
 * If unset, inspects local wrangler OAuth configuration.
 */
export function getAuthToken(): string | null {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }

  // Check local wrangler config
  const candidates = [
    process.env.APPDATA
      ? join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml')
      : null,
    join(homedir(), '.config', '.wrangler', 'config', 'default.toml'),
    join(homedir(), '.wrangler', 'config', 'default.toml'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const content = readFileSync(candidate, 'utf8');
        const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
        if (match && match[1]) {
          return match[1];
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return null;
}

/**
 * Lists all backup objects from Cloudflare R2 bucket mossplan-backups.
 */
export async function listRemoteBackups(opts: {
  accountId: string;
  bucketName: string;
  apiToken: string;
  prefix?: string;
}): Promise<R2ObjectItem[]> {
  const { accountId, bucketName, apiToken, prefix = BACKUP_PREFIX } = opts;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects?prefix=${encodeURIComponent(prefix)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to list R2 objects (${res.status}): ${errorText}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    result?: R2ObjectItem[];
    errors?: unknown[];
  };
  if (!json.success || !Array.isArray(json.result)) {
    throw new Error(`Cloudflare API error listing R2 objects: ${JSON.stringify(json.errors)}`);
  }

  return json.result;
}

/**
 * Deletes a single object from Cloudflare R2 bucket.
 */
export async function deleteRemoteBackup(opts: {
  accountId: string;
  bucketName: string;
  key: string;
  apiToken: string;
}): Promise<boolean> {
  const { accountId, bucketName, key, apiToken } = opts;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to delete R2 object ${key} (${res.status}): ${errorText}`);
  }

  const json = (await res.json()) as { success: boolean };
  return json.success;
}

/**
 * Prunes backups in R2 bucket keeping the newest `keepCount` backups (default: 12).
 */
export async function pruneRemoteBackups(opts: {
  accountId: string;
  bucketName?: string;
  apiToken: string;
  keepCount?: number;
  dryRun?: boolean;
}): Promise<{ deleted: string[]; kept: string[] }> {
  const bucketName = opts.bucketName || BACKUP_BUCKET_NAME;
  const keepCount = opts.keepCount ?? DEFAULT_RETENTION_COUNT;

  const objects = await listRemoteBackups({
    accountId: opts.accountId,
    bucketName,
    apiToken: opts.apiToken,
    prefix: BACKUP_PREFIX,
  });

  const keys = objects.map((o) => o.key);
  const { keep, prune } = selectBackupsToPrune(keys, keepCount);

  const deleted: string[] = [];
  if (!opts.dryRun) {
    for (const key of prune) {
      await deleteRemoteBackup({
        accountId: opts.accountId,
        bucketName,
        key,
        apiToken: opts.apiToken,
      });
      deleted.push(key);
    }
  }

  return { deleted: opts.dryRun ? prune : deleted, kept: keep };
}
