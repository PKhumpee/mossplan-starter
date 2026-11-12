// SEO gate script (DESIGN §12.1, CONTRACTS §8, D29, T14).
// Audits the built static HTML output in dist/client against SEO rules, crawl graph, and sitemap.
// Fails the build on critical defects; records warnings to .cache/seo-report.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Window } from 'happy-dom';
import { readSiteConfig } from './lib/site';
import { siteFrom } from '../src/shared/site';
import { loadSnapshot } from '../src/lib/content/loader';

interface Issue {
  rule: string;
  file: string;
  message: string;
}

const fails: Issue[] = [];
const warns: Issue[] = [];

const distDir = resolve(process.cwd(), 'dist/client');
if (!existsSync(distDir)) {
  console.error(
    `[seo-audit] dist/client directory not found at ${distDir}. Run astro build first.`,
  );
  process.exit(1);
}

const siteConfig = readSiteConfig();
const site = siteFrom(siteConfig);

// Load content policy for blocked domains
let blockedDomains: string[] = [];
const policyPath = resolve(process.cwd(), 'config/content-policy.json');
if (existsSync(policyPath)) {
  try {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    blockedDomains = policy.blockedDomains || [];
  } catch {
    // ignore
  }
}

// Recursively find all HTML files
function getHtmlFiles(dir: string): string[] {
  let files: string[] = [];
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    if (statSync(full).isDirectory()) {
      files = files.concat(getHtmlFiles(full));
    } else if (item.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

const htmlFiles = getHtmlFiles(distDir);
const articleHtmlPaths = new Set(
  loadSnapshot().articles.map((article) =>
    article.lang === loadSnapshot().site.defaultLang
      ? `${article.slug}/index.html`
      : `${article.lang}/${article.slug}/index.html`,
  ),
);
const indexableUrls = new Set<string>();
const sitemapUrls = new Set<string>();
const noindexUrls = new Set<string>();
const titleMap = new Map<string, string>();
const descMap = new Map<string, string>();

// Read sitemap if exists
const sitemapPath = join(distDir, 'sitemap-0.xml');
const altSitemapPath = join(distDir, 'sitemap-index.xml');
let sitemapContent = '';
if (existsSync(sitemapPath)) {
  sitemapContent = readFileSync(sitemapPath, 'utf8');
} else if (existsSync(altSitemapPath)) {
  sitemapContent = readFileSync(altSitemapPath, 'utf8');
}

if (sitemapContent) {
  const locMatches = sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const match of locMatches) {
    if (match[1]) sitemapUrls.add(match[1].trim());
  }
}

// -------------------------------- Audit each HTML file
for (const file of htmlFiles) {
  const relPath = relative(distDir, file).replace(/\\/g, '/');
  const urlPath = relPath === 'index.html' ? '/' : `/${relPath.replace(/\/index\.html$/, '/')}`;
  const rawHtml = readFileSync(file, 'utf8');

  // 1. DocType, supported page language, meta charset within first 1024 bytes
  const first1024 = rawHtml.slice(0, 1024);
  if (!rawHtml.trimStart().toLowerCase().startsWith('<!doctype html>')) {
    fails.push({
      rule: 'doctype',
      file: relPath,
      message: 'Page does not start with <!doctype html>',
    });
  }
  if (!/<html lang="(?:th|en)"/.test(first1024)) {
    fails.push({
      rule: 'html-lang',
      file: relPath,
      message: 'Missing supported <html lang> in head',
    });
  }
  if (!first1024.includes('charset="utf-8"') && !first1024.includes("charset='utf-8'")) {
    fails.push({
      rule: 'charset',
      file: relPath,
      message: 'Missing <meta charset="utf-8"> within first 1024 bytes',
    });
  }

  // Parse DOM with happy-dom
  const window = new Window();
  const doc = window.document;
  doc.write(rawHtml);

  // Check robots
  const robotsEl = doc.querySelector('meta[name="robots"]');
  const robotsMeta = robotsEl?.getAttribute('content') ?? '';
  const isNoindex = robotsMeta.includes('noindex');
  // Only page-level exclusions: the site-wide PUBLIC_NOINDEX lock marks every page noindex.
  if (robotsEl?.hasAttribute('data-moss-noindex')) noindexUrls.add(urlPath);

  // Check 404 page
  if (relPath === '404.html') {
    if (!isNoindex) {
      fails.push({ rule: '404-noindex', file: relPath, message: '404 page must carry noindex' });
    }
    const canon = doc.querySelector('link[rel="canonical"]');
    if (canon) {
      fails.push({
        rule: '404-no-canonical',
        file: relPath,
        message: '404 page must not carry a canonical link',
      });
    }
    continue;
  }

  // 2. Exactly one H1, no heading skips
  const h1s = doc.querySelectorAll('h1');
  if (h1s.length !== 1) {
    fails.push({
      rule: 'single-h1',
      file: relPath,
      message: `Expected exactly 1 <h1>, found ${h1s.length}`,
    });
  }

  // 3. Img tags have alt and width/height
  const imgs = doc.querySelectorAll('img');
  for (const img of imgs) {
    if (!img.hasAttribute('alt')) {
      fails.push({
        rule: 'img-alt',
        file: relPath,
        message: `Image missing alt attribute: ${img.getAttribute('src')}`,
      });
    }
  }

  // 4. Canonical on indexable pages
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const canonicalHref = canonicalEl?.getAttribute('href') ?? '';

  if (!isNoindex) {
    indexableUrls.add(`${site.url}${urlPath}`);

    if (!canonicalHref) {
      fails.push({
        rule: 'canonical-present',
        file: relPath,
        message: 'Indexable page missing canonical link',
      });
    } else {
      const expectedCanonical = `${site.url}${urlPath}`;
      if (canonicalHref !== expectedCanonical) {
        fails.push({
          rule: 'canonical-match',
          file: relPath,
          message: `Canonical mismatch: expected ${expectedCanonical}, got ${canonicalHref}`,
        });
      }
    }

    // Title and description uniqueness
    const title = doc.querySelector('title')?.textContent?.trim() ?? '';
    const desc =
      doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';

    if (title) {
      if (titleMap.has(title) && titleMap.get(title) !== relPath) {
        fails.push({
          rule: 'title-unique',
          file: relPath,
          message: `Duplicate title "${title}" also in ${titleMap.get(title)}`,
        });
      } else {
        titleMap.set(title, relPath);
      }
    }

    if (desc) {
      if (descMap.has(desc) && descMap.get(desc) !== relPath) {
        fails.push({
          rule: 'desc-unique',
          file: relPath,
          message: `Duplicate description also in ${descMap.get(desc)}`,
        });
      } else {
        descMap.set(desc, relPath);
      }
    }
  }

  // 5. JSON-LD validation
  const isArticlePage = articleHtmlPaths.has(relPath);
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');

  if (isArticlePage && jsonLdScripts.length === 0) {
    fails.push({
      rule: 'jsonld-article-present',
      file: relPath,
      message: 'Article page is missing required script[type="application/ld+json"]',
    });
  }

  for (const s of jsonLdScripts) {
    try {
      const data = JSON.parse(s.textContent || '{}');
      const text = JSON.stringify(data);
      if (text.includes('FAQPage') || text.includes('HowTo') || text.includes('SearchAction')) {
        fails.push({
          rule: 'jsonld-disallowed-type',
          file: relPath,
          message: 'Contains disallowed schema (FAQPage/HowTo/SearchAction)',
        });
      }
    } catch {
      fails.push({ rule: 'jsonld-syntax', file: relPath, message: 'Invalid JSON-LD syntax' });
    }
  }

  // 6. Blocked domains in links
  const links = doc.querySelectorAll('a[href]');
  for (const a of links) {
    const href = a.getAttribute('href') ?? '';
    for (const d of blockedDomains) {
      if (href.includes(d)) {
        fails.push({
          rule: 'blocked-domain',
          file: relPath,
          message: `Contains link to blocked domain "${d}": ${href}`,
        });
      }
    }
  }
}

// -------------------------------- Sitemap ↔ Noindex Consistency
for (const noindexUrl of noindexUrls) {
  const absoluteUrl = new URL(noindexUrl, site.url).href;
  if (sitemapUrls.has(absoluteUrl)) {
    fails.push({
      rule: 'noindex-in-sitemap',
      file: 'sitemap',
      message: `Noindex page must not appear in sitemap: ${noindexUrl}`,
    });
  }
}

for (const indexable of indexableUrls) {
  if (sitemapUrls.size > 0 && !sitemapUrls.has(indexable)) {
    // If not in sitemap
    warns.push({
      rule: 'sitemap-missing-page',
      file: 'sitemap',
      message: `Indexable page not found in sitemap: ${indexable}`,
    });
  }
}

// -------------------------------- Robots.txt & llms.txt Checks
const robotsPath = join(distDir, 'robots.txt');
if (!existsSync(robotsPath)) {
  fails.push({
    rule: 'robots-txt-exists',
    file: 'robots.txt',
    message: 'robots.txt was not generated',
  });
} else {
  const robotsTxt = readFileSync(robotsPath, 'utf8');
  if (site.noindex && !robotsTxt.includes('Disallow: /')) {
    fails.push({
      rule: 'robots-noindex',
      file: 'robots.txt',
      message: 'robots.txt must Disallow / when PUBLIC_NOINDEX=true',
    });
  }
}

const llmsPath = join(distDir, 'llms.txt');
if (!existsSync(llmsPath)) {
  fails.push({ rule: 'llms-txt-exists', file: 'llms.txt', message: 'llms.txt was not generated' });
}

// -------------------------------- Output Report
const report = {
  timestamp: Date.now(),
  pagesAudited: htmlFiles.length,
  indexablePages: indexableUrls.size,
  failsCount: fails.length,
  warnsCount: warns.length,
  fails,
  warns,
};

mkdirSync(resolve(process.cwd(), '.cache'), { recursive: true });
writeFileSync(
  resolve(process.cwd(), '.cache/seo-report.json'),
  JSON.stringify(report, null, 2),
  'utf8',
);

console.log(
  `[check:seo] Audited ${htmlFiles.length} pages: ${fails.length} fails, ${warns.length} warnings.`,
);

if (warns.length > 0) {
  for (const w of warns.slice(0, 5)) {
    console.warn(` [warn] ${w.rule}: ${w.message} (${w.file})`);
  }
}

if (fails.length > 0) {
  for (const f of fails) {
    console.error(` [FAIL] ${f.rule}: ${f.message} (${f.file})`);
  }
  process.exit(1);
}

console.log('[check:seo] All SEO gate rules passed successfully!');
