-- iCloud Shared Album copies (see $lib/server/icloud). Trimmed by hand to the
-- new table and its index: the generator also rebuilt `user` to drop
-- `user_role_check`, the same pre-existing drift 0006, 0008 and 0009 leave alone.
CREATE TABLE `icloud_asset` (
	`guid` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`album` text NOT NULL,
	`batch_guid` text NOT NULL,
	`image_id` integer,
	`video_url` text,
	`poster_url` text,
	`contributor` text,
	`caption` text,
	`posted_at` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `icloud_asset_image_id_idx` ON `icloud_asset` (`image_id`);
