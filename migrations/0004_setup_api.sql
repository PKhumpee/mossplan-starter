CREATE TABLE IF NOT EXISTS `setup_state` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `token_hash` text NOT NULL,
  `consumed_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `setup_attempts` (
  `ip_hash` text PRIMARY KEY NOT NULL,
  `failed_count` integer NOT NULL DEFAULT 0,
  `window_started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `setup_sessions` (
  `session_hash` text PRIMARY KEY NOT NULL,
  `iv` text NOT NULL,
  `ciphertext` text NOT NULL,
  `expires_at` integer NOT NULL,
  `otp_expires_at` integer,
  `attempts` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `secrets` (
  `name` text PRIMARY KEY NOT NULL,
  `iv` text NOT NULL,
  `ciphertext` text NOT NULL,
  `updated_at` integer NOT NULL
);
