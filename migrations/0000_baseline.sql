-- Baseline from 0000_fancy_cerebro.sql
CREATE TABLE IF NOT EXISTS `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `article` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`content_json` text NOT NULL,
	`cover_media_id` text,
	`category_id` text,
	`author_id` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`content_modified_at` integer,
	`seo_title` text,
	`seo_description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "article_reviewer_not_author" CHECK("article"."reviewed_by" IS NULL OR "article"."reviewed_by" <> "article"."author_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `article_slug_unique` ON `article` (`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `article_status_published_at_idx` ON `article` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `article_category_id_idx` ON `article` (`category_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `article_tag` (
	`article_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`article_id`, `tag_id`),
	FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `article_tag_tag_id_idx` ON `article_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`meta_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `build` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`reason` text NOT NULL,
	`requested_by` text,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`run_url` text,
	`error` text,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `build_requested_at_idx` ON `build` (`requested_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `category` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `invite_email_unique` ON `invite` (`email`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`alt` text DEFAULT '' NOT NULL,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_r2_key_unique` ON `media` (`r2_key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `page_stat_daily` (
	`path` text NOT NULL,
	`day` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`path`, `day`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `page_stat_daily_day_idx` ON `page_stat_daily` (`day`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `redirect` (
	`from_path` text PRIMARY KEY NOT NULL,
	`to_path` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tag_slug_unique` ON `tag` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`slug` text,
	`job_title` text,
	`bio` text,
	`avatar_media_id` text,
	`same_as_json` text DEFAULT '[]' NOT NULL,
	`knows_about_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`avatar_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_slug_unique` ON `user` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
-- Baseline from 0001_whole_king_bedlam.sql
CREATE TABLE IF NOT EXISTS `affiliate_click` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`clicked_at` integer NOT NULL,
	`day` text NOT NULL,
	`referer_path` text,
	`ip_hash` text NOT NULL,
	`country` text,
	`device` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `affiliate_link`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `affiliate_click_day_idx` ON `affiliate_click` (`day`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `affiliate_click_daily` (
	`link_id` text NOT NULL,
	`article_id` text DEFAULT '' NOT NULL,
	`day` text NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`unique_clicks` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`link_id`, `article_id`, `day`),
	FOREIGN KEY (`link_id`) REFERENCES `affiliate_link`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `affiliate_conversion` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text,
	`merchant_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`day` text NOT NULL,
	`amount_satang` integer,
	`commission_satang` integer NOT NULL,
	`currency` text DEFAULT 'THB' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`external_id` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `affiliate_link`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `affiliate_conversion_merchant_external_idx` ON `affiliate_conversion` (`merchant_id`,`external_id`) WHERE "affiliate_conversion"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `affiliate_conversion_day_idx` ON `affiliate_conversion` (`day`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `affiliate_link` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`merchant_id` text NOT NULL,
	`destination_url` text NOT NULL,
	`fallback_url` text,
	`label` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer,
	`last_checked_at` integer,
	`last_check_status` text,
	`last_check_hops` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `affiliate_link_slug_unique` ON `affiliate_link` (`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `affiliate_link_merchant_id_idx` ON `affiliate_link` (`merchant_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `affiliate_link_status_idx` ON `affiliate_link` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchant` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`tracking_hosts_json` text DEFAULT '[]' NOT NULL,
	`network` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `merchant_domain_unique` ON `merchant` (`domain`);
--> statement-breakpoint
-- Baseline from 0002_absent_betty_brant.sql
CREATE TABLE IF NOT EXISTS `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `setting` (`key`, `value`, `updated_at`) VALUES ('allow_indexing', 'false', 1700000000000);
