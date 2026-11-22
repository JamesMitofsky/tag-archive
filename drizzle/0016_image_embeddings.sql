-- Where each photograph sits in the space text queries are embedded into, so
-- /images can find a photograph by what it shows (see
-- src/lib/server/imageEmbeddings.ts). Empty until the upload hook, the nightly
-- catch-up or scripts/backfill-embeddings.ts fill it in; a photograph without
-- a row is simply not found by content.
CREATE TABLE `image_embedding` (
	`image_id` integer PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`vector` F32_BLOB(768) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE cascade
);
