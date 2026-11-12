import type { ArticleItem } from './queries';
import { getSiteInfo } from './queries';

/** Public article URL: default language at the root, other languages under their prefix. */
export function articlePath(article: Pick<ArticleItem, 'lang' | 'slug'>): string {
  const prefix = article.lang === getSiteInfo().defaultLang ? '' : `/${article.lang}`;
  return `${prefix}/${article.slug}/`;
}
