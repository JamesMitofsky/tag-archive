import { redirect } from '@sveltejs/kit';
import { listAlbums } from '#lib/server/albums.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// This view is signed-in only; the keeper page owns the sign-in flow.
	if (!locals.user) throw redirect(303, '/keeper');

	// Only what a row shows and its search reads. Each track's file stays on the
	// album's own page.
	const albums = (await listAlbums()).map((album) => ({
		id: album.id,
		title: album.title,
		artist: album.artist,
		description: album.description,
		event: album.event,
		date: album.date,
		proposedAddition: album.proposedAddition,
		tracks: album.tracks.map((t) => ({ title: t.title, duration: t.duration }))
	}));

	return {
		user: { email: locals.user.email, role: locals.user.role },
		albums
	};
};
