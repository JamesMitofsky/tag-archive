import { lt, sql } from 'drizzle-orm';
import { db } from './db';
import { rateLimit } from './db/schema';
import { sign } from './signing';

/**
 * Fixed-window rate limiting for anonymous writes, backed by the database.
 *
 * Why the database: the app runs as stateless serverless functions, so an
 * in-memory counter would reset per instance; and Netlify's platform rate
 * limits attach to standalone functions or redirect rules, not to routes inside
 * SvelteKit's generated function. One upsert per guarded request is cheap next
 * to the write it guards.
 *
 * Subjects (IP addresses, draft ids) are stored hashed, never raw.
 */
export type Limit = { limit: number; windowMs: number };

const HOUR = 60 * 60 * 1000;

/**
 * The policy for every anonymous write, in one place. The NFC tap and the
 * per-draft cap are the real gates; the per-IP limits are backstops, set loose
 * on purpose — volunteers at a garden event share one Wi-Fi network, and so one
 * address, so a tight per-IP limit would lock out a busy afternoon.
 */
export const LIMITS = {
	/** Tag taps (each opens the site and starts a draft), per IP. */
	tapPerIp: { limit: 300, windowMs: HOUR },
	/** Image uploads per IP — a long multi-page scan is a few dozen, per person. */
	uploadPerIp: { limit: 1500, windowMs: HOUR },
	/** Image uploads per draft session, per day — the cap on any one visitor. */
	uploadPerDraft: { limit: 200, windowMs: 24 * HOUR },
	/** Artefact submissions per IP. */
	submitPerIp: { limit: 150, windowMs: HOUR },
	/** Contact details left after submitting, per IP. */
	connectPerIp: { limit: 150, windowMs: HOUR }
} satisfies Record<string, Limit>;

/**
 * Count one request against `bucket` for `subject`; true while still within
 * the limit. Atomic: a single INSERT … ON CONFLICT DO UPDATE … RETURNING, so
 * concurrent requests can't both read the same count.
 */
export async function consume(
	bucket: string,
	subject: string,
	{ limit, windowMs }: Limit,
	now = Date.now()
): Promise<boolean> {
	const key = `${bucket}:${sign('rate-limit', subject).slice(0, 22)}`;
	const windowStart = Math.floor(now / windowMs) * windowMs;

	const [row] = await db
		.insert(rateLimit)
		.values({ key, windowStart, count: 1 })
		.onConflictDoUpdate({
			target: rateLimit.key,
			// SET expressions read the row's pre-update values, so both see the old
			// window: same window → increment, a new one → start over at 1.
			set: {
				count: sql`case when ${rateLimit.windowStart} = ${windowStart} then ${rateLimit.count} + 1 else 1 end`,
				windowStart
			}
		})
		.returning({ count: rateLimit.count });

	return row.count <= limit;
}

/** Drop counters whose window ended long ago (the daily sweep calls this). */
export async function pruneRateLimits(olderThanMs: number, now = Date.now()): Promise<number> {
	const deleted = await db
		.delete(rateLimit)
		.where(lt(rateLimit.windowStart, now - olderThanMs))
		.returning({ key: rateLimit.key });
	return deleted.length;
}
