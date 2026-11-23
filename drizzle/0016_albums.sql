-- Albums: recorded music uploaded as an ordered set of tracks (see
-- $lib/server/albums). `album` comes first so `track`'s foreign key names a
-- table that already exists. Tracks cascade with their album; an album's event
-- link does not, like an artefact's.
CREATE TABLE `album` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`description` text,
	`event_id` integer,
	`date` text,
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
CREATE INDEX `album_date_id_idx` ON `album` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `album_event_id_idx` ON `album` (`event_id`);--> statement-breakpoint
CREATE TABLE `track` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`album_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`type` text NOT NULL,
	`bytes` integer NOT NULL,
	`duration` real,
	`original_name` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`album_id`) REFERENCES `album`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_url_idx` ON `track` (`url`);--> statement-breakpoint
CREATE INDEX `track_album_position_idx` ON `track` (`album_id`,`position`);--> statement-breakpoint
CREATE INDEX `track_created_at_idx` ON `track` (`created_at`);