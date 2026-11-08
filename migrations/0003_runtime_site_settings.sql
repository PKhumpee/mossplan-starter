CREATE TABLE IF NOT EXISTS `site_settings` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `site_url` text,
  `site_name` text,
  `default_lang` text NOT NULL DEFAULT 'th',
  `indexing_enabled` integer NOT NULL DEFAULT 0,
  `setup_completed_at` integer,
  `updated_at` integer NOT NULL
);
