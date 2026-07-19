/**
 * Audit-column stamps for user-driven writes. Spread into a Drizzle
 * `.values()` / `.set()` so no call site hand-writes the column names.
 *
 * Timestamps are NOT stamped here: `created_at` comes from the schema SQL
 * default at insert, `updated_at` auto-bumps via the column's `$onUpdate`.
 * Only the actor columns need the current user threaded in.
 *
 * On INSERT both `createdBy` and `updatedBy` are set to the creator, so
 * `updatedBy` is never null for a user-created row (an unedited row reads as
 * "last touched by whoever made it").
 */
export const stampInsert = (userId: string) => ({ createdBy: userId, updatedBy: userId });
export const stampUpdate = (userId: string) => ({ updatedBy: userId });
