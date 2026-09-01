PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artefact` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artefact` text NOT NULL,
	`event_id` integer,
	`date` text NOT NULL,
	`program_area` text DEFAULT '[]' NOT NULL,
	`description` text,
	`file_urls` text DEFAULT '[]' NOT NULL,
	`location` text,
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
INSERT INTO `__new_artefact`("id", "artefact", "event_id", "date", "program_area", "description", "file_urls", "location", "proposed_addition", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "artefact", "event_id", "date", "program_area", "description", "file_urls", "location", "proposed_addition", "created_at", "updated_at", "created_by", "updated_by" FROM `artefact`;--> statement-breakpoint
DROP TABLE `artefact`;--> statement-breakpoint
ALTER TABLE `__new_artefact` RENAME TO `artefact`;--> statement-breakpoint
CREATE INDEX `artefact_date_id_idx` ON `artefact` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `artefact_event_id_idx` ON `artefact` (`event_id`);--> statement-breakpoint
CREATE INDEX `artefact_title_idx` ON `artefact` (`artefact`);--> statement-breakpoint
CREATE TABLE `__new_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`series_id` integer,
	`date` text NOT NULL,
	`time` text,
	`location` text,
	`description` text,
	`url` text,
	`may_have_exception` integer DEFAULT false NOT NULL,
	`possible_exception_description` text,
	`proposed_addition` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_event`("id", "title", "series_id", "date", "time", "location", "description", "url", "may_have_exception", "possible_exception_description", "proposed_addition", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "title", "series_id", "date", "time", "location", "description", "url", "may_have_exception", "possible_exception_description", "proposed_addition", "created_at", "updated_at", "created_by", "updated_by" FROM `event`;--> statement-breakpoint
DROP TABLE `event`;--> statement-breakpoint
ALTER TABLE `__new_event` RENAME TO `event`;--> statement-breakpoint
CREATE INDEX `event_series_date_idx` ON `event` (`series_id`,`date`);--> statement-breakpoint
CREATE INDEX `event_date_id_idx` ON `event` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `event_title_idx` ON `event` (`title`);--> statement-breakpoint
CREATE TABLE `__new_person` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_person`("id", "name", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "name", "created_at", "updated_at", "created_by", "updated_by" FROM `person`;--> statement-breakpoint
DROP TABLE `person`;--> statement-breakpoint
ALTER TABLE `__new_person` RENAME TO `person`;--> statement-breakpoint
CREATE UNIQUE INDEX `person_name_unique` ON `person` (`name`);--> statement-breakpoint
CREATE INDEX `person_name_idx` ON `person` (`name`);--> statement-breakpoint
CREATE TABLE `__new_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_day_of_week` text,
	`default_time` text,
	`frequency` text,
	`proposed_addition` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_series`("id", "name", "description", "default_day_of_week", "default_time", "frequency", "proposed_addition", "created_at", "updated_at", "created_by", "updated_by") SELECT "id", "name", "description", "default_day_of_week", "default_time", "frequency", "proposed_addition", "created_at", "updated_at", "created_by", "updated_by" FROM `series`;--> statement-breakpoint
DROP TABLE `series`;--> statement-breakpoint
ALTER TABLE `__new_series` RENAME TO `series`;--> statement-breakpoint
CREATE UNIQUE INDEX `series_name_unique` ON `series` (`name`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `artefact_prov_person_id_idx` ON `artefact_provenance` (`person_id`);--> statement-breakpoint
CREATE INDEX `event_host_person_id_idx` ON `event_host` (`person_id`);
