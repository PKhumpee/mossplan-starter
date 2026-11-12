-- Promote the earliest existing admin to the unique owner role.
-- The NOT EXISTS guard makes this safe to rerun; the migration ledger also records its checksum.
UPDATE `user`
SET `role` = 'owner'
WHERE `id` = (
  SELECT `id`
  FROM `user`
  WHERE `role` = 'admin'
    AND NOT EXISTS (SELECT 1 FROM `user` WHERE `role` = 'owner')
  ORDER BY `created_at` ASC, `id` ASC
  LIMIT 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_single_owner` ON `user` (`role`) WHERE `role` = 'owner';
