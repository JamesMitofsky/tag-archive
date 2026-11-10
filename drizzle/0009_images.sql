-- Image sets: photographs uploaded together (see $lib/server/imageSets). Trimmed
-- by hand to the three new tables and their indexes: the generator also rebuilt
-- `user` to drop `user_role_check`, the same pre-existing drift 0006 and 0008
-- leave alone. `image_set` comes first so `image`'s foreign key names a table
-- that already exists.
CREATE TABLE `image_set` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text,
	`event_id` integer,
	`date` text,
	`date_auto` integer DEFAULT true NOT NULL,
	`proposed_addition` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `image_set_date_id_idx` ON `image_set` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `image_set_event_id_idx` ON `image_set` (`event_id`);--> statement-breakpoint
CREATE TABLE `image` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`set_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`url` text NOT NULL,
	`original_url` text NOT NULL,
	`original_type` text NOT NULL,
	`original_name` text,
	`original_bytes` integer NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`captured_at` text,
	`captured_offset` text,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`set_id`) REFERENCES `image_set`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_original_url_idx` ON `image` (`original_url`);--> statement-breakpoint
CREATE INDEX `image_set_position_idx` ON `image` (`set_id`,`position`);--> statement-breakpoint
CREATE INDEX `image_created_at_idx` ON `image` (`created_at`);--> statement-breakpoint
CREATE TABLE `image_set_contact` (
	`set_id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`set_id`) REFERENCES `image_set`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
