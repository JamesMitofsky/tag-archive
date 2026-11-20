-- Contact details left after a public submission are no longer collected, so
-- their two tables go, and every name and email in them with them. The drops
-- are deliberate, so the migration gate (scripts/migrate-test.sh) is told to
-- expect them:
-- migrate-test: drops image_set_contact
-- migrate-test: drops submission_contact
--
-- IF EXISTS: a database migrated on develop before main was merged in already
-- dropped both tables in a since-removed 0010, and must not fail here.
DROP TABLE IF EXISTS `image_set_contact`;--> statement-breakpoint
DROP TABLE IF EXISTS `submission_contact`;
