// Pagefind indexing script (CONTRACTS §9, S2 verdict, T15).
// Pre-segments article text with Intl.Segmenter('th') using U+200B (zero-width space) separator
// so Pagefind builds accurate Thai word boundaries while keeping excerpts clean.
// Output goes to dist/client/pagefind so static asset serving handles it.
import * as pagefind from 'pagefind';
import { loadSnapshot } from '../src/lib/content/loader';
import { extractNodeText } from '../src/lib/content/render';
import { segmentThai } from '../src/components/public/search/thai-search';

async function buildSearchIndex(): Promise<void> {
  const snapshot = loadSnapshot();
  const categoryMap = new Map(snapshot.categories.map((c) => [c.id, c]));

  const { index } = await pagefind.createIndex({});
  if (!index) throw new Error('Failed to create pagefind index');
  let count = 0;

  for (const article of snapshot.articles) {
    const category = article.categoryId ? categoryMap.get(article.categoryId) : undefined;
    const bodyText = extractNodeText(article.content as any);
    const combined = `${article.title}\n${article.excerpt}\n${bodyText}`;

    // U+200B: invisible in rendered excerpts, Pagefind treats as word boundary
    const segmentedContent = segmentThai(combined, '\u200B');

    await index.addCustomRecord({
      url:
        article.lang === snapshot.site.defaultLang
          ? `/${article.slug}/`
          : `/${article.lang}/${article.slug}/`,
      content: segmentedContent,
      language: article.lang,
      meta: {
        title: article.title,
        excerpt: article.excerpt,
        category: category?.name ?? '',
        categorySlug: category?.slug ?? '',
        publishedAt: String(article.publishedAt ?? ''),
      },
      filters: {
        category: category?.slug ? [category.slug] : [],
      },
    });
    count++;
  }

  await index.writeFiles({ outputPath: 'dist/client/pagefind' });
  await pagefind.close();
  console.log(`[pagefind] successfully indexed ${count} articles to dist/client/pagefind`);
}

buildSearchIndex().catch((err) => {
  console.error('[pagefind] error building index:', err);
  process.exit(1);
});
