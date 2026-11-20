-- Contact details left after a public submission are no longer collected, so
-- their two tables go, and every name and email in them with them. The drops
-- are deliberate, so the migration gate (scripts/migrate-test.sh) is told to
-- expect them:
-- migrate-test: drops image_set_contact
-- migrate-test: drops submission_contact
DROP TABLE `image_set_contact`;--> statement-breakpoint
DROP TABLE `submission_contact`;
