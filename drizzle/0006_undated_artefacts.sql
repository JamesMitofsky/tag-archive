-- Make artefact.date nullable: NULL = deliberately undated (see $lib/partialDate).
-- Hand-written as a plain SQLite table rebuild — the same pattern as 0005 — so it
-- runs unchanged on every engine this project touches (Turso Cloud/sqld, `turso
-- dev`, embedded libsql). The generator's output instead used libSQL's
-- `ALTER COLUMN` extension and also rebuilt `user` to drop `user_role_check`, an
-- unrelated, pre-existing drift between auth.schema.ts and the database that is
-- deliberately left alone here.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artefact` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artefact` text NOT NULL,
	`event_id` integer,
	`date` text,
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
-- Carry the AUTOINCREMENT high-water mark across the rebuild. The copy above only
-- seeds the new table's sequence with max(id) of the rows that still exist, so if
-- the newest artefact had been deleted its id would be handed out again — and ids
-- are written on the physical artefacts. Take whichever mark is higher.
INSERT INTO sqlite_sequence (name, seq) SELECT '__new_artefact', 0 WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '__new_artefact');--> statement-breakpoint
UPDATE sqlite_sequence SET seq = max(seq, coalesce((SELECT seq FROM sqlite_sequence WHERE name = 'artefact'), 0)) WHERE name = '__new_artefact';--> statement-breakpoint
DROP TABLE `artefact`;--> statement-breakpoint
ALTER TABLE `__new_artefact` RENAME TO `artefact`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `artefact_date_id_idx` ON `artefact` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `artefact_event_id_idx` ON `artefact` (`event_id`);--> statement-breakpoint
CREATE INDEX `artefact_title_idx` ON `artefact` (`artefact`);
