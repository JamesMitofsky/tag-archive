import { error } from '@sveltejs/kit';
import { idSchema } from '#lib/schemas.ts';
import { listFeatureCandidates } from '#lib/server/eventFeatures.ts';
import type { RequestHandler } from './$types';

/**
 * The feature image picker's search over the archive: artefacts and image sets
 * narrowed by `?q`. With `?event=<id>` (the edit page), those linked to that
 * event are left out, as the page's load already lists them; without it (the
 * add page, for an event that doesn't exist yet), everything is searched.
 *
 * Open to every keeper, as the add form is: a contributor sees here only what
 * the keeper lists already show them, pending submissions included. Listeners
 * never reach it (hooks.server.ts keeps them off `locals.user`).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const eventParam = url.searchParams.get('event');
	let eventId: number | null = null;
	if (eventParam !== null) {
		const id = idSchema.safeParse(eventParam);
		if (!id.success) throw error(400, 'Unknown event');
		eventId = id.data;
	}

	// Bounded so a crafted URL can't make the LIKE patterns arbitrarily long.
	const q = (url.searchParams.get('q') ?? '').slice(0, 200);
	return Response.json(await listFeatureCandidates(eventId, { linked: false, q }));
};
