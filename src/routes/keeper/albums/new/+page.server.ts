import { fail, redirect } from '@sveltejs/kit';
import { createAlbum } from '#lib/server/albums.ts';
import { summary } from '#lib/validation/helpers.ts';
import { createAlbumSuite, echoAlbumForm, parseAlbumForm } from '#lib/validation/album.ts';
import type { Actions, PageServerLoad } from './$types';

// The new-album form. Keepers only: albums have no public submit, so there is
// no /contribute counterpart. A contributor's album lands as a proposed
// addition for an admin to vet, an admin's goes straight into the archive.

export const load: PageServerLoad = ({ locals }) => {
	// The hook bounces anonymous requests; this narrows the type and backs it up.
	if (!locals.user) throw redirect(303, '/keeper');
	return {};
};

export const actions: Actions = {
	createAlbum: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { albumError: 'Sign in to add an album' });

		const form = await request.formData();
		const data = parseAlbumForm(form);
		const values = echoAlbumForm(form);

		const result = createAlbumSuite()(data);
		if (!result.isValid()) {
			return fail(400, { albumError: summary(result), errors: result.getErrors(), values });
		}

		// Ids come from the browser, so `createAlbum` re-checks every one is an
		// unattached upload this keeper finalized themselves (see `ownsTrack`).
		let created;
		try {
			created = await createAlbum(data, {
				userId: locals.user.id,
				role: locals.user.role ?? null
			});
		} catch (error) {
			// Thrown, this would replace the form with the error page, and every
			// uploaded track with it. Answer as a failed submit instead.
			console.error('createAlbum failed', error);
			return fail(500, {
				albumError: 'The album could not be saved. Nothing here is lost: try again.',
				values
			});
		}
		if (!created.ok) return fail(400, { albumError: created.message, values });

		throw redirect(303, `/keeper/albums/${created.id}?created`);
	}
};
