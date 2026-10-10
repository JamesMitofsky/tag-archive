-- The NFC tags whose taps open the site (see $lib/server/nfc/taps). Trimmed by
-- hand to the new table: the generator also rebuilt `user` to drop
-- `user_role_check`, the same pre-existing drift 0006 leaves alone.
CREATE TABLE `nfc_tag` (
	`uid` text PRIMARY KEY NOT NULL,
	`last_counter` integer NOT NULL,
	`label` text,
	`revoked_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
