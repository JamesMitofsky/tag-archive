-- Feature images: the one photograph or artefact page an event shows as its
-- own (see $lib/server/eventFeatures). A table of its own, one row per event,
-- so deleting the event, the photograph or the artefact cascades the choice
-- away; the CHECK keeps each row to exactly one of the two sources.
CREATE TABLE `event_feature_image` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`image_id` integer,
	`artefact_id` integer,
	`artefact_file_url` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artefact_id`) REFERENCES `artefact`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "event_feature_image_source_check" CHECK(("event_feature_image"."image_id" IS NOT NULL AND "event_feature_image"."artefact_id" IS NULL AND "event_feature_image"."artefact_file_url" IS NULL) OR ("event_feature_image"."image_id" IS NULL AND "event_feature_image"."artefact_id" IS NOT NULL AND "event_feature_image"."artefact_file_url" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `event_feature_image_image_id_idx` ON `event_feature_image` (`image_id`);--> statement-breakpoint
CREATE INDEX `event_feature_image_artefact_id_idx` ON `event_feature_image` (`artefact_id`);