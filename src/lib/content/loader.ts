// Node-based snapshot loader (CONTRACTS §6).
// Reads SNAPSHOT_PATH or falls back to fixtures/content-snapshot.sample.json with a warning.
// Safe to import in astro.config.ts, scripts, and content.config.ts before Astro virtual modules exist.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SnapshotSchema, type Snapshot } from '../../shared/snapshot';

let cachedSnapshot: Snapshot | undefined;

export function loadSnapshot(): Snapshot {
  if (cachedSnapshot) return cachedSnapshot;

  const envPath = process.env.SNAPSHOT_PATH;
  const snapshotPath = envPath
    ? resolve(process.cwd(), envPath)
    : resolve(process.cwd(), '.cache/content-snapshot.json');
  const fixturePath = resolve(process.cwd(), 'fixtures/content-snapshot.sample.json');

  let raw: string;
  if (existsSync(snapshotPath)) {
    raw = readFileSync(snapshotPath, 'utf8');
  } else {
    console.warn(`[snapshot] using sample fixture from ${fixturePath}`);
    raw = readFileSync(fixturePath, 'utf8');
  }

  const parsed: unknown = JSON.parse(raw);
  cachedSnapshot = SnapshotSchema.parse(parsed);
  return cachedSnapshot;
}
