import { error, json } from '@sveltejs/kit';
import { idSchema } from '$lib/schemas';
import { listFeatureCandidates } from '$lib/server/eventFeatures';
import type { RequestHandler } from './$types';

/**
 * The feature image picker's search over the rest of the archive: artefacts and
 * image sets not linked to this event, narrowed by `?q`. Admin-only, like the
 * edit page it serves; what is linked to the event ships with that page's load.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'admin') throw error(403, 'Only admins can edit events');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Event not found');

	// Bounded so a crafted URL can't make the LIKE patterns arbitrarily long.
	const q = (url.searchParams.get('q') ?? '').slice(0, 200);
	return json(await listFeatureCandidates(id.data, { linked: false, q }));
};
