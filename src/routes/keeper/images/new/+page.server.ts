import { fail, redirect } from '@sveltejs/kit';
import { createImageSet } from '#lib/server/imageSets.ts';
import { summary } from '#lib/validation/helpers.ts';
import {
	createImageSetSuite,
	echoImageSetCreateForm,
	parseImageSetForm,
	type ImageSetData
} from '#lib/validation/imageSet.ts';
import type { Actions, PageServerLoad } from './$types';

// The keepers' own new-photographs form. The public submit at
// /contribute/images, through the draft session and access pass; keepers stay
// inside /keeper, where the hook already requires a session (see
// #lib/server/keeperGuard). The fields are the same component; what differs is
// who may post and where they land.

export const load: PageServerLoad = ({ locals }) => {
	// The hook bounces anonymous requests; this narrows the type and backs it up.
	if (!locals.user) throw redirect(303, '/keeper');
	return {};
};

export const actions: Actions = {
	createImageSet: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { imageSetError: 'Sign in to add photographs' });

		const form = await request.formData();
		// A new set's date always follows its photographs (see `createImageSet`),
		// whether or not the post carries the form's hidden `dateAuto`.
		const data: ImageSetData = { ...parseImageSetForm(form), dateAuto: true };
		const values = echoImageSetCreateForm(form, data);

		const result = createImageSetSuite()(data);
		if (!result.isValid()) {
			return fail(400, { imageSetError: summary(result), errors: result.getErrors(), values });
		}

		// Ids come from the browser, so `createImageSet` re-checks every one is an
		// unattached upload this keeper finalized themselves (see `ownsImage`).
		const created = await createImageSet(
			data,
			{ userId: locals.user.id, role: locals.user.role ?? null },
			{ kind: 'keeper', userId: locals.user.id }
		);
		if (!created.ok) return fail(400, { imageSetError: created.message, values });

		// Land on the new set, flagged as just created. Vetted when an admin adds
		// it, a proposed addition otherwise, exactly as from /contribute/images.
		throw redirect(303, `/keeper/images/${created.id}?created`);
	}
};
