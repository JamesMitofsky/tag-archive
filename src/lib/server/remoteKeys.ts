import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { remoteKey } from './db/schema';

/**
 * Unlock keys (the `remote_key` table, see #lib/access/key.server): the check
 * /unlock makes, and what the admin page (src/routes/keeper/settings/keys)
 * lists and writes.
 */

/**
 * When a key stops working, as a Julian day number. Stored as hand-typed text:
 * a bare date runs through the end of that day (UTC), anything with a time
 * stops at that moment. Computed in SQL, in one place, so the gate and the
 * admin page can never disagree about whether a key is open.
 */
const endsAt = sql`julianday(${remoteKey.expiresAt}, case when length(${remoteKey.expiresAt}) = 10 then '+1 day' else '+0 days' end)`;

/** The same moment in Unix milliseconds, for display. */
const endsAtMs = sql<number>`cast(round((${endsAt} - 2440587.5) * 86400000) as integer)`;

const openAt = (now: Date) => sql`${endsAt} > julianday(${now.toISOString()})`;

/** The key as SQLite folds it, for the case-insensitive match the unique index makes. */
const sameKey = (key: string) => sql`lower(${remoteKey.unlockKey}) = lower(${key})`;

/**
 * Whether `key` is an unlock key that still opens the archive at `now`.
 * Matched case-insensitively, as the table's unique index on
 * `lower(unlock_key)` is, so a phone keyboard's capital letter doesn't lock
 * anyone out.
 */
export async function keyOpens(key: string, now = new Date()): Promise<boolean> {
	const row = await db
		.select({ found: sql<number>`1` })
		.from(remoteKey)
		.where(and(sameKey(key), openAt(now)))
		.get();
	return !!row;
}

export type RemoteKeyRow = {
	key: string;
	/** As stored: a date (`2026-12-31`) or a date-time typed by hand. */
	expiresAt: string;
	/** The moment it stops opening, in Unix milliseconds. */
	endsAt: number;
	open: boolean;
};

/** Every key, the latest-closing first. */
export async function listKeys(now = new Date()): Promise<RemoteKeyRow[]> {
	const rows = await db
		.select({
			key: remoteKey.unlockKey,
			expiresAt: remoteKey.expiresAt,
			endsAt: endsAtMs,
			open: sql<number>`${openAt(now)}`
		})
		.from(remoteKey)
		.orderBy(desc(endsAt), remoteKey.unlockKey);
	return rows.map((row) => ({ ...row, open: !!row.open }));
}

/**
 * Add a key, or report that one differing only in case already exists. A
 * check-then-insert would race; the unique index is the authority, so insert
 * and treat a conflict as the answer.
 */
export async function createKey(key: string, expiresOn: string): Promise<'created' | 'taken'> {
	const inserted = await db
		.insert(remoteKey)
		.values({ unlockKey: key, expiresAt: expiresOn })
		.onConflictDoNothing()
		.returning({ key: remoteKey.unlockKey });
	return inserted.length ? 'created' : 'taken';
}

/** Move a key's expiry; false when there is no such key. */
export async function setKeyExpiry(key: string, expiresAt: string): Promise<boolean> {
	const updated = await db
		.update(remoteKey)
		.set({ expiresAt })
		.where(eq(remoteKey.unlockKey, key))
		.returning({ key: remoteKey.unlockKey });
	return updated.length > 0;
}

/**
 * Close a key now, keeping its row so the admin page still lists it: its
 * expiry becomes this moment, to the second, UTC.
 */
export function endKey(key: string, now = new Date()): Promise<boolean> {
	return setKeyExpiry(key, now.toISOString().slice(0, 19).replace('T', ' '));
}

/** Remove a key altogether; false when there was none. */
export async function deleteKey(key: string): Promise<boolean> {
	const deleted = await db
		.delete(remoteKey)
		.where(eq(remoteKey.unlockKey, key))
		.returning({ key: remoteKey.unlockKey });
	return deleted.length > 0;
}
