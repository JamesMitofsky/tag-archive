-- Unlock keys that open the archive from anywhere (see $lib/server/remoteKeys).
-- Trimmed by hand to the new table and its index: the generator also rebuilt
-- `user` to drop `user_role_check`, the same pre-existing drift 0006, 0008 and
-- 0009 leave alone.
CREATE TABLE `remote_key` (
	`unlock_key` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "remote_key_unlock_key_check" CHECK("remote_key"."unlock_key" <> '' AND "remote_key"."unlock_key" = trim("remote_key"."unlock_key")),
	CONSTRAINT "remote_key_expires_at_check" CHECK("remote_key"."expires_at" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' AND julianday("remote_key"."expires_at") IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remote_key_unlock_key_lower_idx` ON `remote_key` (lower("unlock_key"));
