// Content snapshot: the build's only data source (CONTRACTS §6). Workers-safe, pure.
// Produced by /api/internal/snapshot (T12), written by scripts/snapshot.ts, read by src/content.config.ts (T05).
import { z } from 'zod';

const slug = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SnapshotSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]).default(2),
  generatedAt: z.number().int(),
  site: z.object({
    name: z.string(),
    description: z.string(),
    url: z.string(),
    defaultLang: z.enum(['th', 'en']).default('th'),
  }),
  categories: z.array(
    z.object({
      id: z.string().min(1),
      slug,
      name: z.string().min(1),
      description: z.string().nullable(),
      sortOrder: z.number().int(),
    }),
  ),
  tags: z.array(z.object({ id: z.string().min(1), slug, name: z.string().min(1) })),
  media: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      mime: z.string().min(1),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      alt: z.string(),
    }),
  ),
  /** Complete profiles of users who wrote or reviewed a published article. */
  authors: z.array(
    z.object({
      id: z.string().min(1),
      slug,
      name: z.string().min(1),
      jobTitle: z.string().min(1),
      bio: z.string().min(1),
      avatarMediaId: z.string().nullable(),
      sameAs: z.array(z.url()),
      knowsAbout: z.array(z.string()),
    }),
  ),
  /** Published only, newest first. */
  articles: z.array(
    z.object({
      id: z.string().min(1),
      slug,
      lang: z.enum(['th', 'en']).default('th'),
      translationGroupId: z.string().nullable().optional().default(null),
      title: z.string().min(1),
      excerpt: z.string(),
      /** Tiptap JSON document, rendered by src/lib/content/render.ts. See `TiptapDocSchema`. */
      content: z.unknown(),
      coverMediaId: z.string().nullable(),
      categoryId: z.string().nullable(),
      tagIds: z.array(z.string()),
      authorId: z.string().min(1),
      reviewerId: z.string().nullable(),
      reviewedAt: z.number().int().nullable(),
      publishedAt: z.number().int(),
      /** `article.content_modified_at` (D30), never `updated_at`. */
      updatedAt: z.number().int(),
      seo: z.object({ title: z.string().nullable(), description: z.string().nullable() }),
      hasAffiliate: z.boolean().optional().default(false),
    }),
  ),
  /** Snapshot version 2: affiliate links metadata */
  affiliateLinks: z
    .array(
      z.object({
        id: z.string().min(1),
        slug: z.string().min(1),
        merchantName: z.string().min(1),
        merchantHosts: z.array(z.string()),
        status: z.enum(['active', 'paused', 'broken']),
      }),
    )
    .optional()
    .default([]),
  /** The redirect table, for `_redirects`. */
  redirects: z.array(z.object({ from: z.string().min(1), to: z.string().min(1) })),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;

// ---------------------------------------------------------------- Tiptap document (CONTRACTS §6)

export const ALLOWED_NODES = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'image',
  'youtube',
] as const;

export const ALLOWED_MARKS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'affiliateLink',
] as const;

export interface TiptapNode {
  type: (typeof ALLOWED_NODES)[number];
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: (typeof ALLOWED_MARKS)[number]; attrs?: Record<string, unknown> }[];
  text?: string;
}

const TiptapMarkSchema = z.object({
  type: z.enum(ALLOWED_MARKS),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

/** Strict check of a Tiptap document against the allowed nodes and marks. Unknown nodes fail. */
export const TiptapNodeSchema: z.ZodType<TiptapNode> = z.lazy(() =>
  z.object({
    type: z.enum(ALLOWED_NODES),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(TiptapNodeSchema).optional(),
    marks: z.array(TiptapMarkSchema).optional(),
    text: z.string().optional(),
  }),
);

export const TiptapDocSchema = TiptapNodeSchema.refine((n) => n.type === 'doc', {
  message: 'root node must be "doc"',
});
