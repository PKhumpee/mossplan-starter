// Loads a content snapshot into D1 (local development and tests). Workers-safe; idempotent.
// Authors become `user` rows with invented `@example.test` addresses; they have no sessions.
import type { Snapshot } from '../../shared/snapshot';
import type { Db } from './client';
import { article, articleTag, category, invite, media, redirect, tag, user } from './schema';
import { eq } from 'drizzle-orm';

export interface SeedOptions {
  /** Admin invite to create (CONTRACTS §4 bootstrap). Lowercased before storing. */
  adminEmail?: string | undefined;
}

export interface SeedResult {
  users: number;
  categories: number;
  tags: number;
  media: number;
  articles: number;
  redirects: number;
}

type Statement = Parameters<Db['batch']>[0][number];

export function seedEmail(slug: string): string {
  return `${slug}@example.test`;
}

export async function seedFromSnapshot(
  db: Db,
  snapshot: Snapshot,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const t = snapshot.generatedAt;
  const firstAuthor = snapshot.authors[0];
  const statements: Statement[] = [];

  // Users first with no avatar (media.uploaded_by references user), then media, then the avatar links.
  snapshot.authors.forEach((a, i) => {
    statements.push(
      db
        .insert(user)
        .values({
          id: a.id,
          name: a.name,
          email: seedEmail(a.slug),
          emailVerified: true,
          role: i === 0 ? 'admin' : 'editor',
          slug: a.slug,
          jobTitle: a.jobTitle,
          bio: a.bio,
          sameAsJson: JSON.stringify(a.sameAs),
          knowsAboutJson: JSON.stringify(a.knowsAbout),
        })
        .onConflictDoNothing(),
    );
  });
  for (const m of snapshot.media) {
    statements.push(
      db
        .insert(media)
        .values({
          id: m.id,
          r2Key: m.key,
          filename: m.key.split('/').pop() ?? m.key,
          mime: m.mime,
          bytes: 0,
          width: m.width,
          height: m.height,
          alt: m.alt,
          uploadedBy: firstAuthor?.id ?? null,
          createdAt: t,
        })
        .onConflictDoNothing(),
    );
  }
  for (const a of snapshot.authors) {
    if (a.avatarMediaId) {
      statements.push(
        db.update(user).set({ avatarMediaId: a.avatarMediaId }).where(eq(user.id, a.id)),
      );
    }
  }
  for (const c of snapshot.categories) {
    statements.push(
      db
        .insert(category)
        .values({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          sortOrder: c.sortOrder,
          createdAt: t,
          updatedAt: t,
        })
        .onConflictDoNothing(),
    );
  }
  for (const g of snapshot.tags) {
    statements.push(
      db
        .insert(tag)
        .values({ id: g.id, slug: g.slug, name: g.name, createdAt: t })
        .onConflictDoNothing(),
    );
  }
  for (const a of snapshot.articles) {
    statements.push(
      db
        .insert(article)
        .values({
          id: a.id,
          slug: a.slug,
          lang: a.lang,
          translationGroupId: a.translationGroupId,
          title: a.title,
          excerpt: a.excerpt,
          contentJson: JSON.stringify(a.content),
          coverMediaId: a.coverMediaId,
          categoryId: a.categoryId,
          authorId: a.authorId,
          reviewedBy: a.reviewerId,
          reviewedAt: a.reviewedAt,
          status: 'published',
          publishedAt: a.publishedAt,
          contentModifiedAt: a.updatedAt,
          seoTitle: a.seo.title,
          seoDescription: a.seo.description,
          createdAt: a.publishedAt,
          updatedAt: a.updatedAt,
        })
        .onConflictDoNothing(),
    );
    for (const tagId of a.tagIds) {
      statements.push(
        db.insert(articleTag).values({ articleId: a.id, tagId }).onConflictDoNothing(),
      );
    }
  }
  for (const r of snapshot.redirects) {
    const reason = r.from.startsWith('/category/') ? 'category' : 'article';
    statements.push(
      db
        .insert(redirect)
        .values({ fromPath: r.from, toPath: r.to, reason, createdAt: t })
        .onConflictDoNothing(),
    );
  }
  if (options.adminEmail) {
    statements.push(
      db
        .insert(invite)
        .values({
          id: crypto.randomUUID(),
          email: options.adminEmail.trim().toLowerCase(),
          role: 'admin',
          createdAt: Date.now(),
        })
        .onConflictDoNothing(),
    );
  }

  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);

  return {
    users: snapshot.authors.length,
    categories: snapshot.categories.length,
    tags: snapshot.tags.length,
    media: snapshot.media.length,
    articles: snapshot.articles.length,
    redirects: snapshot.redirects.length,
  };
}
