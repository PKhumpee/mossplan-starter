// Content queries and pagination helpers (CONTRACTS §6, §7; DESIGN §5, §6).
// Reads the validated snapshot generated for the build.
import { loadSnapshot } from './loader';
import type { Snapshot } from '../../shared/snapshot';

declare const __SNAPSHOT__: Snapshot | undefined;

export function getSnapshot(): Snapshot {
  if (typeof __SNAPSHOT__ !== 'undefined') {
    return __SNAPSHOT__;
  }
  return loadSnapshot();
}

export const PAGE_SIZE = 12;

export type ArticleItem = Snapshot['articles'][number];
export type CategoryItem = Snapshot['categories'][number];
export type TagItem = Snapshot['tags'][number];
export type AuthorItem = Snapshot['authors'][number];
export type MediaItem = Snapshot['media'][number];

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): PaginatedResult<T> {
  const safePage = Math.max(1, page);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    items: pageItems,
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

/** All published articles, newest first (CONTRACTS §6). */
export function getPublishedArticles(): ArticleItem[] {
  const snapshot = getSnapshot();
  return [...snapshot.articles].sort((a, b) => b.publishedAt - a.publishedAt);
}

export function getArticleBySlug(slug: string): ArticleItem | undefined {
  const articles = getPublishedArticles();
  return articles.find((a) => a.slug === slug);
}

export function getAllCategories(): CategoryItem[] {
  const snapshot = getSnapshot();
  return [...snapshot.categories].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getCategoryBySlug(slug: string): CategoryItem | undefined {
  const categories = getAllCategories();
  return categories.find((c) => c.slug === slug);
}

export function getCategoryById(id: string | null): CategoryItem | undefined {
  if (!id) return undefined;
  const categories = getAllCategories();
  return categories.find((c) => c.id === id);
}

export function getArticlesByCategory(categoryId: string): ArticleItem[] {
  return getPublishedArticles().filter((a) => a.categoryId === categoryId);
}

export function getAllTags(): TagItem[] {
  const snapshot = getSnapshot();
  return [...snapshot.tags].sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

export function getTagBySlug(slug: string): TagItem | undefined {
  const tags = getAllTags();
  return tags.find((t) => t.slug === slug);
}

export function getTagById(id: string): TagItem | undefined {
  const tags = getAllTags();
  return tags.find((t) => t.id === id);
}

export function getArticlesByTag(tagId: string): ArticleItem[] {
  return getPublishedArticles().filter((a) => a.tagIds.includes(tagId));
}

/**
 * A tag page is "thin" if it has fewer than 2 published articles (D33, DESIGN §11.1).
 * Thin tag pages still render but carry `noindex, follow` and stay out of the sitemap.
 */
export function isThinTag(tagId: string): boolean {
  return getArticlesByTag(tagId).length < 2;
}

export function getAllAuthors(): AuthorItem[] {
  const snapshot = getSnapshot();
  return [...snapshot.authors];
}

export function getAuthorBySlug(slug: string): AuthorItem | undefined {
  const authors = getAllAuthors();
  return authors.find((a) => a.slug === slug);
}

export function getAuthorById(id: string): AuthorItem | undefined {
  const authors = getAllAuthors();
  return authors.find((a) => a.id === id);
}

export function getArticlesByAuthor(authorId: string): ArticleItem[] {
  return getPublishedArticles().filter((a) => a.authorId === authorId);
}

export function getArticlesReviewedByAuthor(authorId: string): ArticleItem[] {
  return getPublishedArticles().filter((a) => a.reviewerId === authorId);
}

export function getAllMedia(): MediaItem[] {
  const snapshot = getSnapshot();
  return [...snapshot.media];
}

export function getMediaById(id: string | null): MediaItem | undefined {
  if (!id) return undefined;
  const snapshot = getSnapshot();
  return snapshot.media.find((m) => m.id === id);
}

/**
 * Returns up to `count` related articles sharing the most tags,
 * falling back to the same category if few tags match (DESIGN §5.2).
 */
export function getRelatedArticles(article: ArticleItem, count = 3): ArticleItem[] {
  const all = getPublishedArticles().filter((a) => a.id !== article.id);
  const currentTags = new Set(article.tagIds);

  const scored = all.map((a) => {
    let score = 0;
    for (const tid of a.tagIds) {
      if (currentTags.has(tid)) score += 2;
    }
    if (article.categoryId && a.categoryId === article.categoryId) score += 1;
    return { article: a, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.article.publishedAt - a.article.publishedAt)
    .slice(0, count)
    .map((s) => s.article);
}

/**
 * Returns previous (older) and next (newer) published articles in chronological order.
 */
export function getAdjacentArticles(article: ArticleItem): {
  prev?: ArticleItem;
  next?: ArticleItem;
} {
  const all = getPublishedArticles(); // sorted newest first
  const index = all.findIndex((a) => a.id === article.id);
  if (index === -1) return {};

  const next = index > 0 ? all[index - 1] : undefined; // newer
  const prev = index < all.length - 1 ? all[index + 1] : undefined; // older

  return { prev, next };
}

export function getSiteInfo(): Snapshot['site'] {
  const snapshot = getSnapshot();
  return snapshot.site;
}
