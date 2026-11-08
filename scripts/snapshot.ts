// Snapshot script (CONTRACTS §6, §8, T12).
// Fetches /api/internal/snapshot with BUILD_CALLBACK_TOKEN, validates against SnapshotSchema,
// and writes to SNAPSHOT_PATH. Never logs secret tokens or raw snapshot payloads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSiteConfig } from './lib/site';
import { SnapshotSchema, type Snapshot } from '../src/shared/snapshot';

export interface SnapshotOptions {
  targetPath?: string;
  baseUrl?: string;
  token?: string;
  bootstrap?: boolean;
}

export async function fetchAndWriteSnapshot(opts: SnapshotOptions = {}): Promise<Snapshot> {
  const root = resolve(import.meta.dirname, '..');
  const targetPath = resolve(
    root,
    opts.targetPath ?? process.env.SNAPSHOT_PATH ?? '.cache/content-snapshot.json',
  );
  const isBootstrap =
    opts.bootstrap ?? (process.env.BOOTSTRAP === 'true' || process.argv.includes('--bootstrap'));

  let siteUrl: string;
  try {
    const config = readSiteConfig();
    siteUrl = opts.baseUrl ?? process.env.BUILD_SITE_URL ?? process.env.SITE_URL ?? config.SITE_URL;
  } catch (err) {
    if (isBootstrap) {
      siteUrl = opts.baseUrl ?? process.env.BUILD_SITE_URL ?? process.env.SITE_URL ?? '';
      if (!siteUrl) {
        throw new Error(
          'Unable to determine SITE_URL for bootstrap. Set BUILD_SITE_URL or SITE_URL, or pass http://localhost:8787 for local use.',
          { cause: err },
        );
      }
    } else {
      throw err;
    }
  }

  // 1. Bootstrap mode: write minimal valid empty snapshot
  if (isBootstrap) {
    const emptySnapshot: Snapshot = {
      version: 2,
      generatedAt: Date.now(),
      site: {
        name: 'Mossplan',
        description: 'บทความและข่าวสารที่อ่านง่าย เขียนด้วยข้อมูลที่ตรวจสอบได้',
        url: siteUrl,
        defaultLang: 'th',
      },
      categories: [],
      tags: [],
      media: [],
      authors: [],
      articles: [],
      affiliateLinks: [],
      redirects: [],
    };

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, JSON.stringify(emptySnapshot, null, 2), 'utf8');
    console.log(`[snapshot] bootstrap: wrote empty snapshot to ${targetPath}`);
    return emptySnapshot;
  }

  // 2. Normal mode: fetch from Worker endpoint with Bearer token
  const token = opts.token ?? process.env.BUILD_CALLBACK_TOKEN?.trim();
  if (!token) {
    throw new Error('BUILD_CALLBACK_TOKEN is required to fetch content snapshot');
  }

  const endpoint = `${siteUrl.replace(/\/+$/, '')}/api/internal/snapshot`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Snapshot endpoint responded with HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { data?: unknown };
  const rawSnapshot = json && typeof json === 'object' && 'data' in json ? json.data : json;

  // 3. Strict schema validation
  const validated = SnapshotSchema.parse(rawSnapshot);

  // 4. Write to disk
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(validated, null, 2), 'utf8');
  console.log(
    `[snapshot] fetched and saved valid snapshot (${validated.articles.length} articles, ${validated.categories.length} categories, ${validated.tags.length} tags) to ${targetPath}`,
  );

  return validated;
}

// Auto-run if executed as script
const isMain =
  process.argv[1] &&
  (import.meta.url === pathToFileURL(resolve(process.argv[1])).href ||
    process.argv[1].endsWith('snapshot.ts'));

if (isMain) {
  fetchAndWriteSnapshot().catch((err) => {
    console.error('[snapshot] failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
