-- A ThumbHash per photograph (see #lib/images/placeholder): the blur a print
-- shows while its pixels load. Nullable: rows from before this migration have
-- none until scripts/backfill-placeholders.ts fills them in, and a browser
-- that can't read its canvas back uploads without one.
ALTER TABLE `image` ADD `placeholder` text;
