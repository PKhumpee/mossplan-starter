export function articleTitle(seoTitle: string | null | undefined, title: string, siteName: string) {
  return `${seoTitle?.trim() || title} · ${siteName}`;
}

export function articleDescription(
  seoDescription: string | null | undefined,
  excerpt: string,
  maxGraphemes = 160,
) {
  const value = (seoDescription?.trim() || excerpt).replace(/\s+/g, ' ');
  const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
  return [...segmenter.segment(value)]
    .slice(0, maxGraphemes)
    .map(({ segment }) => segment)
    .join('');
}

export interface ArticleLocale {
  slug: string;
  lang: 'th' | 'en';
  translationGroupId: string | null;
}

export function articleAlternates(
  articles: ArticleLocale[],
  article: ArticleLocale,
  defaultLang: 'th' | 'en',
  origin: string,
) {
  if (!article.translationGroupId) return [];
  const translation = articles.find(
    (candidate) =>
      candidate.translationGroupId === article.translationGroupId &&
      candidate.lang !== article.lang,
  );
  if (!translation) return [];
  const path = (item: ArticleLocale) =>
    item.lang === defaultLang ? `/${item.slug}/` : `/${item.lang}/${item.slug}/`;
  const defaultArticle = article.lang === defaultLang ? article : translation;
  return [
    { lang: article.lang, href: `${origin}${path(article)}` },
    { lang: translation.lang, href: `${origin}${path(translation)}` },
    { lang: 'x-default', href: `${origin}${path(defaultArticle)}` },
  ];
}
