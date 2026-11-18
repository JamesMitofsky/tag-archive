import { and, sql } from 'drizzle-orm';
import { db } from './db';
import { remoteKey } from './db/schema';

/**
 * Whether `key` is an unlock key that still opens the archive at `now` (see
 * the `remote_key` table and $lib/access/key.server). Matched case-insensitively,
 * as the table's unique index on `lower(unlock_key)` is, so a phone keyboard's
 * capital letter doesn't lock anyone out.
 *
 * The expiry is compared in SQL because it is stored as hand-typed text: a bare
 * date runs through the end of that day (UTC), anything with a time stops at
 * that moment.
 */
export async function keyOpens(key: string, now = new Date()): Promise<boolean> {
	const expiry = sql`julianday(${remoteKey.expiresAt}, case when length(${remoteKey.expiresAt}) = 10 then '+1 day' else '+0 days' end)`;
	const row = await db
		.select({ found: sql<number>`1` })
		.from(remoteKey)
		.where(
			and(
				sql`lower(${remoteKey.unlockKey}) = lower(${key})`,
				sql`${expiry} > julianday(${now.toISOString()})`
			)
		)
		.get();
	return !!row;
}
