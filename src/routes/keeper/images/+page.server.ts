import { redirect } from '@sveltejs/kit';
import { listImageSets } from '$lib/server/imageSets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// This view is signed-in only; the keeper page owns the sign-in flow.
	if (!locals.user) throw redirect(303, '/keeper');

	// Only what a row shows. Each photograph's metadata and original stay on the
	// server: the list would ship every one of them for a cover and a count.
	const sets = (await listImageSets()).map((set) => {
		const cover = set.images[0];
		return {
			id: set.id,
			description: set.description,
			event: set.event,
			date: set.date,
			proposedAddition: set.proposedAddition,
			count: set.images.length,
			cover: cover ? { url: cover.url, width: cover.width, height: cover.height } : null
		};
	});

	return {
		user: { email: locals.user.email, role: locals.user.role },
		sets
	};
};
