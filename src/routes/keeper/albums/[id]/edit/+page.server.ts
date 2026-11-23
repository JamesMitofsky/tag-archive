import { error, fail, redirect } from '@sveltejs/kit';
import { deleteAlbum, loadAlbum, STALE_REFUSAL, updateAlbum } from '#lib/server/albums.ts';
import { toUploadedTrack } from '#lib/server/trackUploads.ts';
import { idSchema } from '#lib/schemas.ts';
import { summary } from '#lib/validation/helpers.ts';
import { createAlbumSuite, echoAlbumForm, parseAlbumForm } from '#lib/validation/album.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Editing is admin-only; bounce anyone else back to the album's page.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, `/keeper/albums/${params.id}`);

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Album not found');

	const album = await loadAlbum(id.data);
	if (!album) throw error(404, 'Album not found');

	return {
		user: { email: locals.user.email, role: locals.user.role },
		album: {
			id: album.id,
			title: album.title,
			artist: album.artist,
			description: album.description,
			event: album.event,
			// The linked occurrence, which the form posts back so a save keeps it.
			eventId: album.eventId,
			date: album.date,
			tracks: album.tracks.map(toUploadedTrack),
			// When the album last changed, in ms: the save sends it back, and is
			// refused once anything (another save, an approval) has moved it on.
			version: album.updatedAt.getTime()
		}
	};
};

export const actions: Actions = {
	updateAlbum: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { albumError: 'Sign in to edit an album' });
		if (locals.user.role !== 'admin') {
			return fail(403, { albumError: 'Only admins can edit albums' });
		}

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { albumError: 'Unknown album' });

		const form = await request.formData();
		const data = parseAlbumForm(form);
		const values = echoAlbumForm(form);
		const result = createAlbumSuite()(data);
		if (!result.isValid()) {
			return fail(400, { albumError: summary(result), errors: result.getErrors(), values });
		}

		// Tracklist, order, titles, removals and fields all settle in here; a
		// refusal (the album changed since the page loaded, a track claimed
		// elsewhere, the album deleted meanwhile) leaves the album as it was. A
		// page sent with no version reads as NaN, which no album is at.
		const version = Number(form.get('version') ?? NaN);
		const saved = await updateAlbum(id.data, data, locals.user.id, { version });
		if (!saved.ok) return fail(400, { albumError: saved.message, values });

		throw redirect(303, `/keeper/albums/${id.data}`);
	},

	deleteAlbum: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { albumError: 'Sign in to delete an album' });
		// Server-side role gate — the UI hides the button, but this is the enforcement.
		if (locals.user.role !== 'admin') {
			return fail(403, { albumError: 'Only admins can delete albums' });
		}

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { albumError: 'Unknown album' });

		// Takes the tracks with it, rows and stored files — but only the album as
		// this page showed it (see `deleteAlbum`). Already gone (a second tab,
		// say) ends in the same place as deleted.
		const version = Number((await request.formData()).get('version') ?? NaN);
		if (!(await deleteAlbum(id.data, { version })) && (await loadAlbum(id.data))) {
			return fail(409, { albumError: STALE_REFUSAL });
		}
		throw redirect(303, '/keeper/albums');
	}
};
