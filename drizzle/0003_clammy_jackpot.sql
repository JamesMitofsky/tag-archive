ALTER TABLE `artefact` ADD `proposed_addition` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `proposed_addition` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `proposed_addition` integer DEFAULT false NOT NULL;