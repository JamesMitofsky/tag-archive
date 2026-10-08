import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { nfcTag } from '../db/schema';

/**
 * - `ok`: a genuine tap with a counter this tag has never presented before;
 * - `used`: the counter was already seen — a reload, or a copied URL;
 * - `revoked`: a keeper has disabled this tag.
 */
export type TapOutcome = 'ok' | 'used' | 'revoked';

/**
 * Record a verified tap (see ./sdm) against its tag, accepting it only when its
 * counter is higher than any seen before. Strictly higher, not exactly one
 * higher: the tag counts every read, including ones that never reach us (the
 * iPhone's background reader, a provisioning app), so gaps are normal.
 *
 * Atomic: one INSERT … ON CONFLICT DO UPDATE … WHERE … RETURNING, so two
 * concurrent requests carrying the same counter can't both be accepted — the
 * second finds the row already advanced and updates nothing.
 */
export async function recordTap(
	uid: string,
	counter: number,
	now = new Date()
): Promise<TapOutcome> {
	const accepted = await db
		.insert(nfcTag)
		.values({ uid, lastCounter: counter, firstSeenAt: now, lastSeenAt: now })
		.onConflictDoUpdate({
			target: nfcTag.uid,
			set: { lastCounter: counter, lastSeenAt: now },
			setWhere: and(lt(nfcTag.lastCounter, counter), isNull(nfcTag.revokedAt))
		})
		.returning({ uid: nfcTag.uid });
	if (accepted.length) return 'ok';

	// Refused: say why, for the visitor's message. A read after the fact can't
	// change the outcome, only explain it.
	const row = await db
		.select({ revoked: sql<number>`${nfcTag.revokedAt} is not null` })
		.from(nfcTag)
		.where(eq(nfcTag.uid, uid))
		.get();
	return row?.revoked ? 'revoked' : 'used';
}
