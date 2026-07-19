ALTER TABLE `artefact` ADD `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact` ADD `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `artefact` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `artefact_provenance` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `event` ADD `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `event` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `event_host` ADD `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `event_host` ADD `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `event_host` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `event_host` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `person` ADD `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `person` ADD `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `person` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `person` ADD `updated_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `series` ADD `created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `created_by` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `series` ADD `updated_by` text REFERENCES user(id);