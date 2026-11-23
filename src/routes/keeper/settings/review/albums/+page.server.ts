import { redirect } from '@sveltejs/kit';
import { listProposedAlbums } from '#lib/server/albums.ts';
import { reviewActions } from '#lib/server/reviewActions.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Admin-only review tool; bounce everyone else back to settings.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	const albums = (await listProposedAlbums()).map((album) => ({
		id: album.id,
		title: album.title,
		artist: album.artist,
		description: album.description,
		event: album.event,
		date: album.date,
		tracks: album.tracks.map((t) => ({ id: t.id, title: t.title, duration: t.duration }))
	}));

	return {
		user: { email: locals.user.email, role: locals.user.role },
		albums
	};
};

// Rejecting takes the album's tracks with it, rows and stored files.
export const actions: Actions = reviewActions('album', 'album');
