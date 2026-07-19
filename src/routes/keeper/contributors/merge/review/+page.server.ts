import { fail, redirect } from '@sveltejs/kit';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mergePeople } from '$lib/server/db/queries';
import { artefactProvenance, eventHost, person } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

/** Parse a `1,2,3` id list into a deduped set of positive integers. */
function parseIds(raw: string | null): number[] {
	if (!raw) return [];
	const ids = raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isInteger(n) && n > 0);
	return [...new Set(ids)];
}

export const load: PageServerLoad = async ({ url, locals }) => {
	// Same admin gate as the merge tool this is reached from.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	const ids = parseIds(url.searchParams.get('ids'));
	// Need at least two live entries to have anything to fold together — otherwise
	// send the admin back to pick a group.
	if (ids.length < 2) throw redirect(303, '/keeper/contributors/merge');

	// Same roster shape as the merge picker, scoped to the proposed group.
	const members = await db
		.select({
			id: person.id,
			name: person.name,
			artefactCount: sql<number>`count(distinct ${artefactProvenance.artefactId})`,
			eventCount: sql<number>`count(distinct ${eventHost.eventId})`
		})
		.from(person)
		.leftJoin(artefactProvenance, eq(artefactProvenance.personId, person.id))
		.leftJoin(eventHost, eq(eventHost.personId, person.id))
		.where(inArray(person.id, ids))
		.groupBy(person.id);

	// Some ids may have already been merged away; still need two to proceed.
	if (members.length < 2) throw redirect(303, '/keeper/contributors/merge');

	// Alphabetical, matching the merge picker's roster order.
	members.sort((a, b) => a.name.localeCompare(b.name));

	return {
		user: { email: locals.user.email, role: locals.user.role },
		members
	};
};

export const actions: Actions = {
	// Identical to the manual merge action: fold `removeId` into `keepId`. The admin
	// declares both here; this page only narrows the roster to a proposed group.
	default: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw redirect(303, '/keeper');

		const form = await request.formData();
		const keepId = Number(form.get('keepId'));
		const removeId = Number(form.get('removeId'));

		if (!Number.isInteger(keepId) || keepId <= 0 || !Number.isInteger(removeId) || removeId <= 0)
			return fail(400, { error: 'Pick a contributor to keep and one to remove.' });
		if (keepId === removeId) return fail(400, { error: 'Pick two different contributors.' });

		await mergePeople(keepId, [removeId], locals.user.id);

		// Back to the roster, where the folded entry is now gone.
		throw redirect(303, '/keeper/contributors');
	}
};
