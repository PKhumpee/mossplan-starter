// Open Graph images build-time generator (S4 verdict, T14).
// Runs in Node before astro build, generating pixel-perfect Thai OG images into public/og/.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSnapshot } from '../src/lib/content/loader';
import { formatThaiDate } from '../src/lib/format/date';
import { renderOgCard } from './lib/og';

async function buildOgImages(): Promise<void> {
  const t0 = performance.now();
  const snapshot = loadSnapshot();
  const outDir = resolve(process.cwd(), 'public/og');

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const categoryMap = new Map(snapshot.categories.map((c) => [c.id, c]));
  const authorMap = new Map(snapshot.authors.map((a) => [a.id, a]));

  // 1. Generate default site OG image
  const defaultPng = await renderOgCard({
    title: snapshot.site.description || snapshot.site.name,
    siteName: snapshot.site.name,
    category: 'บทความและสาระน่ารู้',
  });
  writeFileSync(resolve(outDir, 'default.png'), defaultPng);

  // 2. Generate per-article OG image
  let count = 0;
  for (const article of snapshot.articles) {
    const category = article.categoryId ? categoryMap.get(article.categoryId) : undefined;
    const author = authorMap.get(article.authorId);
    const date = article.publishedAt ? formatThaiDate(article.publishedAt) : undefined;

    const png = await renderOgCard({
      title: article.title,
      siteName: snapshot.site.name,
      category: category?.name,
      author: author ? `เขียนโดย ${author.name}` : undefined,
      date,
    });

    writeFileSync(resolve(outDir, `${article.slug}.png`), png);
    count++;
  }

  const duration = Math.round(performance.now() - t0);
  console.log(`[build:og] rendered ${count + 1} OG images in ${duration}ms into public/og/`);
}

buildOgImages().catch((err) => {
  console.error('[build:og] error generating OG images:', err);
  process.exit(1);
});
