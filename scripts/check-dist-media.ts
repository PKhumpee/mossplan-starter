// Build gate script (P2-01): Verifies that static dist output contains zero references
// to /api/admin and zero <img> tags with src starting with /api/.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadSnapshot } from '../src/lib/content/loader';

export interface DistMediaViolation {
  file: string;
  type: '/api/admin' | 'img src=/api/' | 'missing jsonld';
  detail: string;
  line: number;
}

export interface CheckDistMediaResult {
  totalHtmlChecked: number;
  violations: DistMediaViolation[];
  passed: boolean;
}

function getAllFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...getAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

/** Article HTML paths under dist, relative with forward slashes: `/{slug}/index.html` for the
 * default language and `/{lang}/{slug}/index.html` for the other one (D-003). */
export function articleHtmlPaths(): Set<string> {
  const snapshot = loadSnapshot();
  return new Set(
    snapshot.articles.map((article) =>
      article.lang === snapshot.site.defaultLang
        ? `/${article.slug}/index.html`
        : `/${article.lang}/${article.slug}/index.html`,
    ),
  );
}

export function checkDistMedia(distDir?: string, articlePaths?: Set<string>): CheckDistMediaResult {
  const root = process.cwd();
  const targetDir = distDir ?? resolve(root, 'dist/client');

  if (!existsSync(targetDir)) {
    throw new Error(`[check:media] Directory not found: ${targetDir}. Run build first.`);
  }

  const allFiles = getAllFiles(targetDir);
  const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));
  const textMetaFiles = allFiles.filter(
    (f) =>
      (f.endsWith('.txt') || f.endsWith('.xml') || f.endsWith('.json')) && !f.includes('_astro'),
  );

  const violations: DistMediaViolation[] = [];

  // 1. Check all HTML files for /api/admin and <img src="/api/..."
  for (const file of htmlFiles) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    // Check for /api/admin
    if (content.includes('/api/admin')) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.includes('/api/admin')) {
          violations.push({
            file,
            type: '/api/admin',
            detail: `Found forbidden /api/admin reference in public HTML: ${line.trim().slice(0, 160)}`,
            line: i + 1,
          });
        }
      }
    }

    // Check for any <img> with src starting with /api/
    const imgRegex = /<img\b[^>]*?\bsrc=["'](\/api\/[^"']*)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(content)) !== null) {
      const matchIndex = match.index;
      const lineNumber = content.slice(0, matchIndex).split('\n').length;
      violations.push({
        file,
        type: 'img src=/api/',
        detail: `Found forbidden <img> tag pointing to API endpoint: ${match[0]}`,
        line: lineNumber,
      });
    }
  }

  // 2. Check metadata files (.txt, .xml, .json) outside _astro for /api/admin
  for (const file of textMetaFiles) {
    const content = readFileSync(file, 'utf8');
    if (content.includes('/api/admin')) {
      violations.push({
        file,
        type: '/api/admin',
        detail: `Found forbidden /api/admin reference in metadata file: ${file}`,
        line: 1,
      });
    }
  }

  // 3. Article pages must ship JSON-LD (P2-01 C). Articles live at the root, not /articles/.
  const articles = articlePaths ?? articleHtmlPaths();
  for (const file of htmlFiles) {
    const rel = file.slice(targetDir.length).replace(/\\/g, '/');
    if (articles.has(rel)) {
      if (!readFileSync(file, 'utf8').includes('application/ld+json')) {
        violations.push({
          file,
          type: 'missing jsonld',
          detail: 'Article page has no <script type="application/ld+json">',
          line: 1,
        });
      }
    }
  }

  const passed = violations.length === 0;

  if (!passed) {
    console.error(
      `[check:media] FAILED: Found ${violations.length} forbidden API references in static output:`,
    );
    for (const v of violations) {
      console.error(`  - [${v.type}] ${v.file}:${v.line} -> ${v.detail}`);
    }
  } else {
    console.log(
      `[check:media] Passed: Checked ${htmlFiles.length} HTML files and ${textMetaFiles.length} meta files. No /api/admin or img src="/api/ found.`,
    );
  }

  return {
    totalHtmlChecked: htmlFiles.length,
    violations,
    passed,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  try {
    const result = checkDistMedia();
    if (!result.passed) {
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error('[check:media] Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
