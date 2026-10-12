-- Keepers' confirmations that an artefact's archive number is written on the
-- physical item (see `numberConfirmation` in the schema). Trimmed by hand to the
-- new table: the generator also rebuilt `user` to drop `user_role_check`, the
-- same pre-existing drift 0006 and 0008 leave alone.
CREATE TABLE `number_confirmation` (
	`artefact_id` integer PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`artefact_id`) REFERENCES `artefact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Every artefact already in the archive predates the confirmation step, so it
-- is taken as numbered rather than flagged all at once. The null actor marks
-- these rows as the migration's assumption, not a keeper's answer.
INSERT INTO `number_confirmation` (`artefact_id`, `created_at`, `updated_at`)
SELECT `id`, `created_at`, `created_at` FROM `artefact`;
