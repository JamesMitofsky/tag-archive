CREATE INDEX `artefact_date_id_idx` ON `artefact` (`date`,`id`);--> statement-breakpoint
CREATE INDEX `event_series_date_idx` ON `event` (`series_id`,`date`);--> statement-breakpoint
CREATE INDEX `event_date_id_idx` ON `event` (`date`,`id`);