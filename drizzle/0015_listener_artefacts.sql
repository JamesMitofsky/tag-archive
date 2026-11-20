-- The artefacts each listener's account may view (see $lib/roles and the
-- listener_artefact table in schema.ts). A new table only: nothing existing is
-- rebuilt or dropped.
CREATE TABLE `listener_artefact` (
	`user_id` text NOT NULL,
	`artefact_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	PRIMARY KEY(`user_id`, `artefact_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artefact_id`) REFERENCES `artefact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `listener_artefact_artefact_id_idx` ON `listener_artefact` (`artefact_id`);