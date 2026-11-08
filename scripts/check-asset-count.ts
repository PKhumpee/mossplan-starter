// Static asset count and integrity checker (CONTRACTS §8, DESIGN §11.5, DESIGN §12, S3 finding 3, T13).
// Cloudflare Workers free plan static asset cap is 20,000 files.
// - Counts files in static output (dist/client); warns at 15,000 files; fails at 18,000 files.
// - Verifies every /_astro/... URL referenced in HTML files exists on disk (catches workerd crashes/lost transforms).
// - Checks image file size budgets (warns if file > 200 KB, cover > 300 KB).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export const WARN_THRESHOLD = 15000;
export const FAIL_THRESHOLD = 18000;
export const BUDGET_IMAGE_BYTES = 200 * 1024;
export const BUDGET_COVER_BYTES = 300 * 1024;

export interface AssetCheckOptions {
  distDir?: string;
  warnThreshold?: number;
  failThreshold?: number;
}

export interface AssetCheckResult {
  totalFiles: number;
  referencedAssetsChecked: number;
  missingAssets: string[];
  overBudgetImages: { path: string; size: number; budget: number }[];
  warned: boolean;
  failed: boolean;
  errorMessage?: string;
}

export function countFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...countFilesRecursively(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

export function checkAssetCount(options: AssetCheckOptions = {}): AssetCheckResult {
  const root = process.cwd();
  const distDir = options.distDir ?? resolve(root, 'dist/client');
  const warnThreshold = options.warnThreshold ?? WARN_THRESHOLD;
  const failThreshold = options.failThreshold ?? FAIL_THRESHOLD;

  if (!existsSync(distDir)) {
    throw new Error(`[check:assets] Directory not found: ${distDir}. Run pnpm build first.`);
  }

  const allFiles = countFilesRecursively(distDir);
  const totalFiles = allFiles.length;

  console.log(
    `[check:assets] Total static assets: ${totalFiles} files (free plan cap: 20,000; warn: ${warnThreshold}; fail: ${failThreshold})`,
  );

  let failed = false;
  let warned = false;
  let errorMessage: string | undefined;

  // 1. File count check
  if (totalFiles >= failThreshold) {
    failed = true;
    errorMessage = `Static file count ${totalFiles} exceeds the failure threshold of ${failThreshold}!`;
    console.error(`[check:assets] ERROR: ${errorMessage}`);
  } else if (totalFiles >= warnThreshold) {
    warned = true;
    console.warn(
      `[check:assets] WARNING: Static file count ${totalFiles} is approaching the 20,000 free plan limit (warn: ${warnThreshold}).`,
    );
  }

  // 2. S3 finding 3: verify every /_astro/... URL referenced in HTML files exists on disk
  const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));
  const referencedAssets = new Set<string>();
  const missingAssets: string[] = [];

  for (const htmlPath of htmlFiles) {
    const html = readFileSync(htmlPath, 'utf8');
    // Match /_astro/... URLs in src, srcset, href
    const matches = html.matchAll(/\/_astro\/([a-zA-Z0-9_.-]+)/g);
    for (const m of matches) {
      const assetFileName = m[1];
      if (assetFileName) {
        referencedAssets.add(assetFileName);
        const expectedPath = join(distDir, '_astro', assetFileName);
        if (!existsSync(expectedPath)) {
          missingAssets.push(`/_astro/${assetFileName} (referenced in ${htmlPath})`);
        }
      }
    }
  }

  if (missingAssets.length > 0) {
    failed = true;
    const msg = `Found ${missingAssets.length} missing /_astro/ assets referenced by HTML files!`;
    errorMessage = errorMessage ? `${errorMessage}; ${msg}` : msg;
    console.error(`[check:assets] ERROR: ${msg}`);
    for (const missing of missingAssets.slice(0, 10)) {
      console.error(`  - ${missing}`);
    }
  } else {
    console.log(
      `[check:assets] Asset reference integrity verified: all ${referencedAssets.size} unique /_astro/ URLs exist on disk.`,
    );
  }

  // 3. Size budget check (DESIGN §11.5)
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
  const overBudgetImages: { path: string; size: number; budget: number }[] = [];

  for (const file of allFiles) {
    const ext = extname(file).toLowerCase();
    if (imageExtensions.has(ext)) {
      const stat = statSync(file);
      const isCover = file.includes('cover');
      const budget = isCover ? BUDGET_COVER_BYTES : BUDGET_IMAGE_BYTES;
      if (stat.size > budget) {
        overBudgetImages.push({ path: file, size: stat.size, budget });
        console.warn(
          `[check:assets] WARNING: Image file ${file.replace(root, '')} (${(stat.size / 1024).toFixed(1)} KB) exceeds budget of ${(budget / 1024).toFixed(0)} KB`,
        );
        warned = true;
      }
    }
  }

  if (overBudgetImages.length === 0) {
    console.log('[check:assets] Image size budgets verified: all images within limits.');
  }

  if (!failed) {
    console.log('[check:assets] Static asset check passed successfully.');
  }

  return {
    totalFiles,
    referencedAssetsChecked: referencedAssets.size,
    missingAssets,
    overBudgetImages,
    warned,
    failed,
    errorMessage,
  };
}

// CLI execution
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  try {
    const result = checkAssetCount();
    if (result.failed) {
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error('[check:assets] fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
