import { asc, eq, sql } from 'drizzle-orm';
import type { Role } from '$lib/roles';
import { db } from './db';
import { user } from './db/schema';

/**
 * Accounts as admins manage them at Settings → Accounts. Read and written
 * straight from better-auth's `user` table: the admin plugin stores the role
 * there as plain text, and the page's own guard is the permission check (as
 * for unlock keys), so going through the plugin's endpoints would add nothing.
 */

export type AccountRow = {
	id: string;
	name: string;
	email: string;
	role: string | null;
	createdAt: Date;
};

/** Every account, by name (case-insensitive), then email. */
export function listAccounts(): Promise<AccountRow[]> {
	return db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			createdAt: user.createdAt
		})
		.from(user)
		.orderBy(asc(sql`lower(${user.name})`), asc(user.email));
}

/**
 * Set account `id`'s role, as admin `actorId`. Refuses the admin's own account
 * (`self`): an admin who demoted themselves could lock the archive out of its
 * only admin, and refusing the actor's own row is what guarantees one remains.
 *
 * The change reaches someone already signed in on their next request after
 * better-auth's session cookie cache lapses (`cookieCache.maxAge` in
 * $lib/server/auth, five minutes): until then their cached session still
 * carries the old role.
 */
export async function setAccountRole(
	actorId: string,
	id: string,
	role: Role
): Promise<'updated' | 'self' | 'missing'> {
	if (id === actorId) return 'self';
	const rows = await db
		.update(user)
		.set({ role })
		.where(eq(user.id, id))
		.returning({ id: user.id });
	return rows.length ? 'updated' : 'missing';
}
