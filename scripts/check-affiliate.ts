// Affiliate policy and build gate checker (AFFILIATE §7, CONTRACTS §8, T23).
// Audits dist/client output for sponsored rel, disclosure placement, bare merchant links,
// affiliate share cap, blocked merchants, and exclusion from search indexes.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import { loadSnapshot } from '../src/lib/content/loader';
import type { Snapshot } from '../src/shared/snapshot';

export interface Issue {
  rule: string;
  file: string;
  message: string;
}

export interface CheckAffiliateOptions {
  distDir?: string;
  snapshot?: Snapshot;
  affiliatePolicy?: { maxAffiliateArticleShare?: number };
  contentPolicy?: { blockedDomains?: string[]; reviewTerms?: string[] };
}

export interface CheckAffiliateResult {
  passed: boolean;
  fails: Issue[];
  warns: Issue[];
}

/** Checks whether a host matches a domain (exact match or subdomain). */
export function matchesHostOrSubdomain(host: string, domainOrHost: string): boolean {
  const h = host
    .toLowerCase()
    .trim()
    .replace(/^www\./, '');
  const target = domainOrHost
    .toLowerCase()
    .trim()
    .replace(/^www\./, '');
  return h === target || h.endsWith('.' + target);
}

function getHtmlFiles(dir: string): string[] {
  let files: string[] = [];
  if (!existsSync(dir)) return files;
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

export function checkAffiliate(options: CheckAffiliateOptions = {}): CheckAffiliateResult {
  const fails: Issue[] = [];
  const warns: Issue[] = [];

  const root = process.cwd();
  const distDir = options.distDir ?? resolve(root, 'dist/client');

  // 1. Snapshot and Policies
  let snapshot: Snapshot;
  if (options.snapshot) {
    snapshot = options.snapshot;
  } else {
    try {
      snapshot = loadSnapshot();
    } catch (err) {
      return {
        passed: false,
        fails: [
          {
            rule: 'snapshot-load',
            file: 'snapshot',
            message: `Failed to load snapshot: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        warns: [],
      };
    }
  }

  // Affiliate policy (Share cap)
  let maxAffiliateArticleShare = 0.3; // default 30% per AFFILIATE §7
  if (options.affiliatePolicy?.maxAffiliateArticleShare !== undefined) {
    maxAffiliateArticleShare = options.affiliatePolicy.maxAffiliateArticleShare;
  } else {
    const policyPath = resolve(root, 'config/affiliate-policy.json');
    if (existsSync(policyPath)) {
      try {
        const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
        if (typeof policy.maxAffiliateArticleShare === 'number') {
          maxAffiliateArticleShare = policy.maxAffiliateArticleShare;
        }
      } catch {
        // ignore
      }
    }
  }

  // Content policy (Blocked domains)
  let blockedDomains: string[] = [];
  if (options.contentPolicy?.blockedDomains) {
    blockedDomains = options.contentPolicy.blockedDomains;
  } else {
    const contentPolicyPath = resolve(root, 'config/content-policy.json');
    if (existsSync(contentPolicyPath)) {
      try {
        const cp = JSON.parse(readFileSync(contentPolicyPath, 'utf8'));
        blockedDomains = cp.blockedDomains || [];
      } catch {
        // ignore
      }
    }
  }

  const affiliateLinks = snapshot.affiliateLinks || [];

  // Collect merchant hosts from snapshot v2 affiliate links
  const merchantHosts = new Set<string>();
  for (const aff of affiliateLinks) {
    for (const h of aff.merchantHosts || []) {
      if (h) merchantHosts.add(h.toLowerCase().trim());
    }
  }

  // ---------------------------------------------------------------- Gate 4: Share cap
  const totalArticles = snapshot.articles.length;
  const affiliateArticles = snapshot.articles.filter((a) => a.hasAffiliate).length;
  const currentShare = totalArticles > 0 ? affiliateArticles / totalArticles : 0;

  if (currentShare > maxAffiliateArticleShare) {
    fails.push({
      rule: 'share-cap',
      file: 'snapshot',
      message: `Affiliate article share ${(currentShare * 100).toFixed(1)}% exceeds cap of ${(maxAffiliateArticleShare * 100).toFixed(1)}% (${affiliateArticles}/${totalArticles} articles)`,
    });
  } else if (totalArticles > 0 && currentShare >= maxAffiliateArticleShare - 0.05) {
    warns.push({
      rule: 'share-cap-warning',
      file: 'snapshot',
      message: `Affiliate article share ${(currentShare * 100).toFixed(1)}% is close to the ${(maxAffiliateArticleShare * 100).toFixed(1)}% cap (${affiliateArticles}/${totalArticles} articles)`,
    });
  }

  // ---------------------------------------------------------------- Gate 5: Blocked merchants
  if (blockedDomains.length > 0) {
    for (const aff of affiliateLinks) {
      for (const host of aff.merchantHosts || []) {
        for (const bd of blockedDomains) {
          if (bd && matchesHostOrSubdomain(host, bd)) {
            fails.push({
              rule: 'blocked-merchant',
              file: 'snapshot',
              message: `Affiliate link "${aff.slug}" points to blocked merchant host "${host}" matching blocked domain "${bd}"`,
            });
          }
        }
      }
    }
  }

  // If distDir does not exist yet (e.g. running check before build), return early with error
  if (!existsSync(distDir)) {
    fails.push({
      rule: 'dist-missing',
      file: distDir,
      message: `dist/client directory not found at ${distDir}. Run build first.`,
    });
    return { passed: false, fails, warns };
  }

  // ---------------------------------------------------------------- HTML Gates (1, 2, 3)
  const htmlFiles = getHtmlFiles(distDir);

  for (const file of htmlFiles) {
    const relPath = relative(distDir, file).replace(/\\/g, '/');
    const rawHtml = readFileSync(file, 'utf8');

    const window = new Window();
    const doc = window.document;
    doc.write(rawHtml);

    // Gate 1 & 2: Check all links pointing to /go/
    const allLinks = Array.from(doc.querySelectorAll('a[href]'));
    const goLinks = allLinks.filter((a) => {
      const href = a.getAttribute('href') || '';
      return href.startsWith('/go/') || href.includes('/go/');
    });

    if (goLinks.length > 0) {
      // Gate 2: Disclosure first — .affiliate-disclosure must appear before the first /go/ link
      const disclosureEl = doc.querySelector('.affiliate-disclosure');
      if (!disclosureEl) {
        fails.push({
          rule: 'disclosure-first',
          file: relPath,
          message: `Page contains /go/ affiliate link but missing .affiliate-disclosure box`,
        });
      } else {
        const firstGoLink = goLinks[0]!;
        const position = disclosureEl.compareDocumentPosition(firstGoLink);
        // Node.DOCUMENT_POSITION_FOLLOWING = 4
        if (!(position & 4)) {
          fails.push({
            rule: 'disclosure-first',
            file: relPath,
            message: `.affiliate-disclosure box must appear before the first /go/ link in DOM order`,
          });
        }
      }

      // Gate 1: Sponsored rel — every a[href^="/go/"] has rel containing sponsored and nofollow
      for (const a of goLinks) {
        const rel = (a.getAttribute('rel') || '').toLowerCase();
        const relParts = rel.split(/\s+/).filter(Boolean);
        if (!relParts.includes('sponsored') || !relParts.includes('nofollow')) {
          fails.push({
            rule: 'sponsored-rel',
            file: relPath,
            message: `Affiliate link "${a.getAttribute('href')}" missing required rel attributes "sponsored" and "nofollow" (found: "${rel}")`,
          });
        }
      }
    }

    // Gate 3: No bare merchant links — no <a> points directly at any host in merchantHosts
    if (merchantHosts.size > 0) {
      for (const a of allLinks) {
        const href = (a.getAttribute('href') || '').trim();
        try {
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
            const urlToParse = href.startsWith('//') ? `https:${href}` : href;
            const parsed = new URL(urlToParse);
            const host = parsed.hostname;
            for (const mHost of merchantHosts) {
              if (matchesHostOrSubdomain(host, mHost)) {
                fails.push({
                  rule: 'no-bare-merchant-links',
                  file: relPath,
                  message: `Found bare direct link to merchant host "${host}": "${href}". Use /go/<slug>/ affiliate link instead.`,
                });
              }
            }
          }
        } catch {
          // ignore invalid URLs
        }
      }
    }
  }

  // ---------------------------------------------------------------- Gate 6: Not indexed (/go/ absent from sitemap, Pagefind; robots.txt disallows it)
  // 6a. Sitemap check
  const sitemapFiles = ['sitemap-0.xml', 'sitemap-index.xml'];
  for (const sf of sitemapFiles) {
    const sPath = join(distDir, sf);
    if (existsSync(sPath)) {
      const sContent = readFileSync(sPath, 'utf8');
      if (sContent.includes('/go/') || sContent.includes('/go<')) {
        fails.push({
          rule: 'not-indexed-sitemap',
          file: sf,
          message: `/go/ links must not appear in sitemap (${sf})`,
        });
      }
    }
  }

  // 6b. Robots.txt check
  const robotsPath = join(distDir, 'robots.txt');
  if (existsSync(robotsPath)) {
    const robotsTxt = readFileSync(robotsPath, 'utf8');
    const hasGoDisallow = /Disallow:\s*\/go\/?/i.test(robotsTxt);
    const hasRootDisallow = /Disallow:\s*\/\s*$/m.test(robotsTxt);
    if (!hasGoDisallow && !hasRootDisallow) {
      fails.push({
        rule: 'not-indexed-robots',
        file: 'robots.txt',
        message: 'robots.txt must contain "Disallow: /go/" (or "Disallow: /" when noindex)',
      });
    }
  }

  // 6c. Pagefind check
  const pagefindDir = join(distDir, 'pagefind');
  if (existsSync(pagefindDir)) {
    const pagefindFiles = readdirSync(pagefindDir);
    for (const pf of pagefindFiles) {
      if (pf.endsWith('.json')) {
        const pfPath = join(pagefindDir, pf);
        const pfContent = readFileSync(pfPath, 'utf8');
        if (pfContent.includes('/go/')) {
          fails.push({
            rule: 'not-indexed-pagefind',
            file: `pagefind/${pf}`,
            message: `/go/ links must not appear in Pagefind search index`,
          });
        }
      }
    }
  }

  return {
    passed: fails.length === 0,
    fails,
    warns,
  };
}

// Auto-run if executed as CLI script
const isMain =
  process.argv[1] &&
  (import.meta.url === pathToFileURL(resolve(process.argv[1])).href ||
    process.argv[1].endsWith('check-affiliate.ts'));

if (isMain) {
  const result = checkAffiliate();

  console.log(
    `[check:affiliate] Audit complete: ${result.fails.length} failures, ${result.warns.length} warnings.`,
  );

  for (const w of result.warns) {
    console.warn(` [warn] ${w.rule}: ${w.message} (${w.file})`);
  }

  for (const f of result.fails) {
    console.error(` [FAIL] ${f.rule}: ${f.message} (${f.file})`);
  }

  if (!result.passed) {
    process.exit(1);
  }

  console.log('[check:affiliate] All affiliate build gates passed successfully!');
}
