// D1 schema for the affiliate system (CONTRACTS §3, AFFILIATE §4).
// Times are integer epoch milliseconds (UTC); money is integer satang (minor units).
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './schema';

// ---------------------------------------------------------------- Affiliate tables

export const merchant = sqliteTable(
  'merchant',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** Registrable domain where readers land, lowercase. */
    domain: text('domain').notNull(),
    /**
     * Extra hosts the pasted affiliate URL may start on, e.g. a network's short-link host
     * such as invol.co or shope.ee; lowercase hostnames, max 10.
     */
    trackingHostsJson: text('tracking_hosts_json').notNull().default('[]'),
    /** Free text, e.g. "Shopee Affiliate", "Involve Asia". */
    network: text('network'),
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('merchant_domain_unique').on(t.domain)],
);

export const affiliateLink = sqliteTable(
  'affiliate_link',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchant.id),
    destinationUrl: text('destination_url').notNull(),
    fallbackUrl: text('fallback_url'),
    label: text('label').notNull(),
    status: text('status', { enum: ['active', 'paused', 'broken'] })
      .notNull()
      .default('active'),
    expiresAt: integer('expires_at'),
    lastCheckedAt: integer('last_checked_at'),
    lastCheckStatus: text('last_check_status'),
    lastCheckHops: integer('last_check_hops'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('affiliate_link_slug_unique').on(t.slug),
    index('affiliate_link_merchant_id_idx').on(t.merchantId),
    index('affiliate_link_status_idx').on(t.status),
  ],
);

export const affiliateClick = sqliteTable(
  'affiliate_click',
  {
    id: text('id').primaryKey(),
    linkId: text('link_id')
      .notNull()
      .references(() => affiliateLink.id, { onDelete: 'cascade' }),
    clickedAt: integer('clicked_at').notNull(),
    /** `YYYY-MM-DD` Bangkok. */
    day: text('day').notNull(),
    refererPath: text('referer_path'),
    ipHash: text('ip_hash').notNull(),
    country: text('country'),
    device: text('device', { enum: ['mobile', 'desktop', 'other'] }).notNull(),
  },
  (t) => [
    // Only indexed on day; no other indexes to keep writes per click low (AFFILIATE §4, S6).
    index('affiliate_click_day_idx').on(t.day),
  ],
);

export const affiliateClickDaily = sqliteTable(
  'affiliate_click_daily',
  {
    linkId: text('link_id')
      .notNull()
      .references(() => affiliateLink.id, { onDelete: 'cascade' }),
    /** Article id or '' for unknown, so PK stays non-null. */
    articleId: text('article_id').notNull().default(''),
    day: text('day').notNull(),
    clicks: integer('clicks').notNull().default(0),
    uniqueClicks: integer('unique_clicks').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.articleId, t.day] })],
);

export const affiliateConversion = sqliteTable(
  'affiliate_conversion',
  {
    id: text('id').primaryKey(),
    linkId: text('link_id').references(() => affiliateLink.id, { onDelete: 'set null' }),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchant.id),
    occurredAt: integer('occurred_at').notNull(),
    day: text('day').notNull(),
    /** Sale amount in satang (minor currency units), null if not provided. */
    amountSatang: integer('amount_satang'),
    /** Commission in satang. */
    commissionSatang: integer('commission_satang').notNull(),
    currency: text('currency').notNull().default('THB'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    externalId: text('external_id'),
    source: text('source', { enum: ['csv', 'manual'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('affiliate_conversion_merchant_external_idx')
      .on(t.merchantId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    index('affiliate_conversion_day_idx').on(t.day),
  ],
);

export type Merchant = typeof merchant.$inferSelect;
export type AffiliateLink = typeof affiliateLink.$inferSelect;
export type AffiliateClick = typeof affiliateClick.$inferSelect;
export type AffiliateClickDaily = typeof affiliateClickDaily.$inferSelect;
export type AffiliateConversion = typeof affiliateConversion.$inferSelect;

export type AffiliateLinkStatus = 'active' | 'paused' | 'broken';
export type AffiliateConversionStatus = 'pending' | 'approved' | 'rejected';
export type AffiliateConversionSource = 'csv' | 'manual';
export type AffiliateClickDevice = 'mobile' | 'desktop' | 'other';
