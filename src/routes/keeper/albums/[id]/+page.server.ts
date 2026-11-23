import { error, redirect } from '@sveltejs/kit';
import { loadAlbum } from '#lib/server/albums.ts';
import { reviewActions } from '#lib/server/reviewActions.ts';
import { idSchema } from '#lib/schemas.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Cloud Keeper is behind sign-in; bounce anonymous visitors to the gate.
	if (!locals.user) throw redirect(302, '/keeper');

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Album not found');

	const album = await loadAlbum(id.data);
	if (!album) throw error(404, 'Album not found');

	// Field by field, so nothing rides along unnoticed. Keepers only, so each
	// track's file particulars may come with it.
	return {
		user: { email: locals.user.email, role: locals.user.role },
		album: {
			id: album.id,
			title: album.title,
			artist: album.artist,
			description: album.description,
			event: album.event,
			date: album.date,
			proposedAddition: album.proposedAddition,
			tracks: album.tracks.map((t) => ({
				id: t.id,
				title: t.title,
				url: t.url,
				type: t.type,
				bytes: t.bytes,
				duration: t.duration,
				originalName: t.originalName
			}))
		}
	};
};

// An admin can vet a proposed album from its own page, as from the review queue.
export const actions: Actions = reviewActions('album', 'album');
