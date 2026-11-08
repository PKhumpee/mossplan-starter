// Media fetcher & optimizer for build time (CONTRACTS §1a, DESIGN §11.5, T13).
// Downloads or copies media files referenced by the snapshot into .cache/media/,
// optimizes them according to the size budget (DESIGN §11.5), and writes to src/generated/media/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { loadSnapshot } from '../src/lib/content/loader';
import { optimizeMedia } from '../src/lib/media/optimize';
import { readSiteConfig } from './lib/site';

export interface FetchMediaOptions {
  cacheDir?: string;
  generatedDir?: string;
  publicDir?: string;
  fixturesDir?: string;
  forceFixture?: boolean;
}

export interface FetchMediaStats {
  total: number;
  cached: number;
  fetched: number;
  optimized: number;
}

export async function fetchMedia(options: FetchMediaOptions = {}): Promise<FetchMediaStats> {
  const root = process.cwd();
  const cacheDir = options.cacheDir ?? resolve(root, '.cache/media');
  const generatedDir = options.generatedDir ?? resolve(root, 'src/generated/media');
  const publicDir = options.publicDir ?? resolve(root, 'public/media');
  const fixturesDir = options.fixturesDir ?? resolve(root, 'fixtures/media');

  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  const snapshot = loadSnapshot();
  const siteConfig = readSiteConfig();

  // Determine if fixture snapshot is in use
  const envSnapshotPath = process.env.SNAPSHOT_PATH;
  const sampleFixturePath = resolve(root, 'fixtures/content-snapshot.sample.json');
  let isFixture = options.forceFixture ?? false;

  if (!isFixture) {
    if (!envSnapshotPath || !existsSync(resolve(root, envSnapshotPath))) {
      isFixture = true;
    } else {
      const currentPath = resolve(root, envSnapshotPath);
      if (currentPath === sampleFixturePath) {
        isFixture = true;
      } else {
        try {
          const targetContent = readFileSync(currentPath, 'utf8').trim();
          const fixtureContent = readFileSync(sampleFixturePath, 'utf8').trim();
          if (targetContent === fixtureContent) {
            isFixture = true;
          }
        } catch {
          // Keep false if unreadable
        }
      }
    }
  }

  const mediaItems = snapshot.media ?? [];
  const coverIds = new Set(snapshot.articles.map((a) => a.coverMediaId).filter(Boolean));
  const avatarIds = new Set(snapshot.authors.map((u) => u.avatarMediaId).filter(Boolean));

  let cachedCount = 0;
  let fetchedCount = 0;
  let optimizedCount = 0;

  for (const item of mediaItems) {
    const rawFilename = basename(item.key);
    const itemDir = join(cacheDir, item.id);
    mkdirSync(itemDir, { recursive: true });
    const cachedFilePath = join(itemDir, rawFilename);

    let rawBuffer: Buffer | null = null;

    // 1. Try cache (media is immutable)
    if (existsSync(cachedFilePath)) {
      rawBuffer = readFileSync(cachedFilePath);
      cachedCount++;
    }

    // 2. Obtain file either from fixtures or via API
    if (!rawBuffer) {
      if (isFixture) {
        const candidatePaths = [
          join(fixturesDir, item.key),
          join(fixturesDir, rawFilename),
          join(fixturesDir, `${item.id}${extname(item.key) || '.jpg'}`),
        ];
        const foundPath = candidatePaths.find((p) => existsSync(p));

        if (!foundPath) {
          throw new Error(
            `[fetch-media] Fixture media file not found for ${item.id} (${item.key}) in ${fixturesDir}`,
          );
        }

        rawBuffer = readFileSync(foundPath);
        writeFileSync(cachedFilePath, rawBuffer);
        fetchedCount++;
      } else {
        const token = process.env.BUILD_CALLBACK_TOKEN;
        const siteUrl = process.env.SITE_URL || siteConfig.SITE_URL;
        const url = `${siteUrl.replace(/\/+$/, '')}/api/internal/media/${item.id}`;
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(
            `[fetch-media] Failed to fetch media ${item.id} from ${url}: HTTP ${res.status} ${res.statusText}`,
          );
        }

        const arrayBuf = await res.arrayBuffer();
        const downloaded = Buffer.from(arrayBuf);
        writeFileSync(cachedFilePath, downloaded);
        rawBuffer = downloaded;
        fetchedCount++;
      }
    }

    if (!rawBuffer) {
      console.warn(`[fetch-media] Missing buffer for media ${item.id}, skipping`);
      continue;
    }

    // 3. Optimize according to DESIGN §11.5 size budgets
    const isCover =
      coverIds.has(item.id) || item.key.includes('cover') || item.id.includes('cover');
    const isAvatar =
      avatarIds.has(item.id) || item.key.includes('avatar') || item.id.includes('avatar');

    // If animated GIF exceeds 500 KB, optimizeMedia will throw to fail the build with advice!
    const optimized = await optimizeMedia({
      buffer: rawBuffer,
      mediaId: item.id,
      key: item.key,
      mime: item.mime,
      isCover,
      isAvatar,
    });

    optimizedCount++;

    // 4. Write optimized file into src/generated/media/ for Astro compilation
    const targetKeyPath = join(generatedDir, item.key);
    mkdirSync(dirname(targetKeyPath), { recursive: true });
    writeFileSync(targetKeyPath, optimized.buffer);

    const targetBaseName = join(generatedDir, basename(item.key));
    if (targetBaseName !== targetKeyPath) {
      writeFileSync(targetBaseName, optimized.buffer);
    }

    const targetIdName = join(generatedDir, `${item.id}.${optimized.extension}`);
    writeFileSync(targetIdName, optimized.buffer);

    // 5. Generate and write AVIF and WebP representations for static public serving
    let avifBuffer: Buffer;
    try {
      avifBuffer = await sharp(rawBuffer).avif({ quality: 80 }).toBuffer();
    } catch {
      avifBuffer = optimized.buffer;
    }

    let webpBuffer: Buffer;
    try {
      webpBuffer = await sharp(rawBuffer).webp({ quality: 85 }).toBuffer();
    } catch {
      webpBuffer = optimized.buffer;
    }

    // Write AVIF & WebP into src/generated/media/
    writeFileSync(join(generatedDir, `${item.id}.avif`), avifBuffer);
    writeFileSync(join(generatedDir, `${item.id}.webp`), webpBuffer);

    // Write public static files to public/media/ so /media/:id, /media/:id.webp, /media/:id.avif are served statically
    writeFileSync(join(publicDir, `${item.id}.avif`), avifBuffer);
    writeFileSync(join(publicDir, `${item.id}.webp`), webpBuffer);
    writeFileSync(join(publicDir, `${item.id}.${optimized.extension}`), optimized.buffer);
    writeFileSync(join(publicDir, item.id), webpBuffer);
    writeFileSync(join(publicDir, basename(item.key)), optimized.buffer);
  }

  console.log(
    `[fetch-media] Completed: ${mediaItems.length} media items (${cachedCount} cached, ${fetchedCount} fetched/copied, ${optimizedCount} optimized)`,
  );

  return {
    total: mediaItems.length,
    cached: cachedCount,
    fetched: fetchedCount,
    optimized: optimizedCount,
  };
}

// CLI execution
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  fetchMedia().catch((err) => {
    console.error('[fetch-media] fatal error:', err);
    process.exit(1);
  });
}
