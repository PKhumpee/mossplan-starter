// D1 schema (CONTRACTS §3). Times are integer epoch milliseconds (UTC); app IDs are crypto.randomUUID() text.
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

const now = () => new Date();

// ---------------------------------------------------------------- Better Auth tables
// Shape per Better Auth's Drizzle adapter (timestamp_ms mode); T06 verifies with the Better Auth CLI.

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now)
      .$onUpdateFn(now),
    // Additional fields (D25); Better Auth declares them `input: false`.
    role: text('role', { enum: ['owner', 'admin', 'editor'] })
      .notNull()
      .default('editor'),
    slug: text('slug'),
    jobTitle: text('job_title'),
    bio: text('bio'),
    avatarMediaId: text('avatar_media_id').references((): AnySQLiteColumn => media.id, {
      onDelete: 'set null',
    }),
    sameAsJson: text('same_as_json').notNull().default('[]'),
    knowsAboutJson: text('knows_about_json').notNull().default('[]'),
  },
  (t) => [uniqueIndex('user_slug_unique').on(t.slug)],
);

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now)
      .$onUpdateFn(now),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now)
      .$onUpdateFn(now),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(now)
      .$onUpdateFn(now),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/** Better Auth database rate-limit storage. `last_request` is epoch ms. */
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
});

// ---------------------------------------------------------------- App tables
// App tables store epoch ms as plain integers so the API and the snapshot move numbers.

export const invite = sqliteTable('invite', {
  id: text('id').primaryKey(),
  /** Stored lowercase. */
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['owner', 'admin', 'editor'] })
    .notNull()
    .default('editor'),
  invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  acceptedAt: integer('accepted_at'),
});

export const category = sqliteTable('category', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const tag = sqliteTable('tag', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  r2Key: text('r2_key').notNull().unique(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  alt: text('alt').notNull().default(''),
  uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
});

export const article = sqliteTable(
  'article',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    /** Tiptap JSON document, serialized. */
    contentJson: text('content_json').notNull(),
    coverMediaId: text('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: integer('reviewed_at'),
    status: text('status', { enum: ['draft', 'scheduled', 'published'] })
      .notNull()
      .default('draft'),
    publishedAt: integer('published_at'),
    /** Public "last updated" date (D30). */
    contentModifiedAt: integer('content_modified_at'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    lang: text('lang').notNull().default('th'),
    translationGroupId: text('translation_group_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('article_status_published_at_idx').on(t.status, t.publishedAt),
    index('article_category_id_idx').on(t.categoryId),
    check(
      'article_reviewer_not_author',
      sql`${t.reviewedBy} IS NULL OR ${t.reviewedBy} <> ${t.authorId}`,
    ),
  ],
);

export const redirect = sqliteTable('redirect', {
  fromPath: text('from_path').primaryKey(),
  toPath: text('to_path').notNull(),
  reason: text('reason', { enum: ['article', 'category', 'tag', 'author'] }).notNull(),
  createdAt: integer('created_at').notNull(),
});

export const articleTag = sqliteTable(
  'article_tag',
  {
    articleId: text('article_id')
      .notNull()
      .references(() => article.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.tagId] }),
    index('article_tag_tag_id_idx').on(t.tagId),
  ],
);

export const build = sqliteTable(
  'build',
  {
    id: text('id').primaryKey(),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] })
      .notNull()
      .default('queued'),
    reason: text('reason').notNull(),
    requestedBy: text('requested_by').references(() => user.id, { onDelete: 'set null' }),
    requestedAt: integer('requested_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    runUrl: text('run_url'),
    error: text('error'),
  },
  (t) => [index('build_requested_at_idx').on(t.requestedAt)],
);

export const pageStatDaily = sqliteTable(
  'page_stat_daily',
  {
    path: text('path').notNull(),
    /** `YYYY-MM-DD`, UTC. */
    day: text('day').notNull(),
    views: integer('views').notNull().default(0),
    visits: integer('visits').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.path, t.day] }), index('page_stat_daily_day_idx').on(t.day)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metaJson: text('meta_json'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('audit_log_created_at_idx').on(t.createdAt)],
);

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const siteSettings = sqliteTable('site_settings', {
  id: integer('id').primaryKey(),
  siteUrl: text('site_url'),
  siteName: text('site_name'),
  defaultLang: text('default_lang').notNull().default('th'),
  indexingEnabled: integer('indexing_enabled').notNull().default(0),
  setupCompletedAt: integer('setup_completed_at'),
  updatedAt: integer('updated_at').notNull(),
});

export const setupState = sqliteTable('setup_state', {
  id: integer('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  consumedAt: integer('consumed_at'),
});

export const setupAttempts = sqliteTable('setup_attempts', {
  ipHash: text('ip_hash').primaryKey(),
  failedCount: integer('failed_count').notNull().default(0),
  windowStartedAt: integer('window_started_at').notNull(),
});

export const setupSessions = sqliteTable('setup_sessions', {
  sessionHash: text('session_hash').primaryKey(),
  iv: text('iv').notNull(),
  ciphertext: text('ciphertext').notNull(),
  expiresAt: integer('expires_at').notNull(),
  otpExpiresAt: integer('otp_expires_at'),
  attempts: integer('attempts').notNull().default(0),
});

export const secrets = sqliteTable('secrets', {
  name: text('name').primaryKey(),
  iv: text('iv').notNull(),
  ciphertext: text('ciphertext').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type User = typeof user.$inferSelect;
export type Article = typeof article.$inferSelect;
export type Category = typeof category.$inferSelect;
export type Tag = typeof tag.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Redirect = typeof redirect.$inferSelect;
export type Setting = typeof setting.$inferSelect;

export * from './affiliate';
