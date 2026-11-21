-- When a keeper vetted a proposed artefact into the public archive, so /live can
-- order arrivals by the moment each went public: coalesce(approved_at,
-- created_at). Nullable, with no backfill: rows created already vetted need
-- none, and for rows approved before now the approval time was never recorded
-- (updated_at would be a guess, moved by every later edit).
ALTER TABLE `artefact` ADD `approved_at` integer;
