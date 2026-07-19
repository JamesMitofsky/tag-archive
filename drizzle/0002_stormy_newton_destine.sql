ALTER TABLE `artefact` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `artefact` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
UPDATE `artefact` SET `created_at` = (cast(unixepoch('subsecond') * 1000 as integer)), `updated_at` = (cast(unixepoch('subsecond') * 1000 as integer));--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
UPDATE `artefact_provenance` SET `created_at` = (cast(unixepoch('subsecond') * 1000 as integer)), `updated_at` = (cast(unixepoch('subsecond') * 1000 as integer));--> statement-breakpoint
ALTER TABLE `event` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `event` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
UPDATE `event` SET `created_at` = (cast(unixepoch('subsecond') * 1000 as integer)), `updated_at` = (cast(unixepoch('subsecond') * 1000 as integer));--> statement-breakpoint
ALTER TABLE `event_host` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_host` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `event_host` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `event_host` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
UPDATE `event_host` SET `created_at` = (cast(unixepoch('subsecond') * 1000 as integer)), `updated_at` = (cast(unixepoch('subsecond') * 1000 as integer));--> statement-breakpoint
ALTER TABLE `person` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `person` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `person` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `person` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
UPDATE `person` SET `created_at` = (cast(unixepoch('subsecond') * 1000 as integer)), `updated_at` = (cast(unixepoch('subsecond') * 1000 as integer));--> statement-breakpoint
ALTER TABLE `series` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `series` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
UPDATE `series` SET `created_at` = (cast(unixepoch('subsecond') * 1000 as integer)), `updated_at` = (cast(unixepoch('subsecond') * 1000 as integer));