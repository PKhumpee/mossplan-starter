// Content Layer collections fed by the JSON snapshot (CONTRACTS §6). Loaders run in Node during
// `astro sync`/`astro build`, before prerendering, so reading the file with node:fs is fine here even
// though pages prerender inside workerd.
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { loadSnapshot } from './lib/content/loader';

export { loadSnapshot };

const articles = defineCollection({
  loader: () => loadSnapshot().articles.map((a) => ({ ...a, id: a.slug })),
  schema: z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    lang: z.enum(['th', 'en']).default('th'),
    translationGroupId: z.string().nullable().default(null),
    title: z.string(),
    excerpt: z.string(),
    content: z.unknown(),
    coverMediaId: z.string().nullable(),
    categoryId: z.string().nullable(),
    tagIds: z.array(z.string()),
    authorId: z.string(),
    reviewerId: z.string().nullable(),
    reviewedAt: z.number().int().nullable(),
    publishedAt: z.number().int(),
    updatedAt: z.number().int(),
    seo: z.object({
      title: z.string().nullable(),
      description: z.string().nullable(),
    }),
    hasAffiliate: z.boolean().default(false),
  }),
});

const categories = defineCollection({
  loader: () => loadSnapshot().categories.map((c) => ({ ...c, id: c.slug })),
  schema: z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
  }),
});

const tags = defineCollection({
  loader: () => loadSnapshot().tags.map((t) => ({ ...t, id: t.slug })),
  schema: z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
  }),
});

const authors = defineCollection({
  loader: () => loadSnapshot().authors.map((a) => ({ ...a, id: a.slug })),
  schema: z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
    jobTitle: z.string(),
    bio: z.string(),
    avatarMediaId: z.string().nullable(),
    sameAs: z.array(z.string()),
    knowsAbout: z.array(z.string()),
  }),
});

const media = defineCollection({
  loader: () => loadSnapshot().media.map((m) => ({ ...m, id: m.id })),
  schema: z.object({
    id: z.string(),
    key: z.string(),
    mime: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    alt: z.string(),
  }),
});

export const collections = { articles, categories, tags, authors, media };
