/**
 * The account roles, in one place for the server and the browser alike.
 *
 * Every signed-in account is handed an access pass (see #lib/server/access), so
 * every one of them opens the archive from anywhere, not only at the Cube. What
 * the role decides is what else the account may do:
 *
 *  - `listener`: nothing else. A listener signs in only so the archive opens
 *    for them wherever they are. They are not a keeper: hooks.server.ts never
 *    puts them on `locals.user`, so every keeper check in the app (the keeper
 *    area, keeper uploads, keeper submissions) already turns them away, and
 *    they reach only the keeper hub and their settings, to sign out.
 *  - `contributor`: a keeper whose entries land as proposed additions.
 *  - `admin`: a keeper with full access, accounts included.
 *
 * The better-auth admin plugin stores the role as free text (no `roles` map is
 * configured in #lib/server/auth), so this list, not the plugin, is what keeps
 * the column to known values: the forms that set a role validate against it.
 */

export const ROLES = ['contributor', 'listener', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** The roles that make an account a keeper. An allow-list on purpose: a role
 *  this list does not name, or no role at all, gets no keeper tools. */
const KEEPER_ROLES: readonly string[] = ['contributor', 'admin'] satisfies Role[];

export function isRole(value: unknown): value is Role {
	return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Whether an account with this role is a keeper (see the top of this file). */
export function isKeeperRole(role: string | null | undefined): boolean {
	return !!role && KEEPER_ROLES.includes(role);
}

/** Labels and one-line descriptions for the pages that show or set a role. */
export const ROLE_META: Record<Role, { label: string; blurb: string }> = {
	contributor: { label: 'Contributor', blurb: 'Submits entries as proposed additions.' },
	listener: {
		label: 'Listener',
		blurb: 'Opens the Archive from anywhere, with no keeper tools.'
	},
	admin: { label: 'Admin', blurb: 'Full access: edit, vet, and manage accounts.' }
};

/** A role's label, or the stored value itself for a role this list doesn't know. */
export function roleLabel(role: string | null | undefined): string {
	if (isRole(role)) return ROLE_META[role].label;
	return role || 'No role';
}
