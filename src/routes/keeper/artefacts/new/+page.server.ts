import { fail, redirect } from '@sveltejs/kit';
import { createArtefact, knownLocations } from '#lib/server/artefacts.ts';
import {
	echoArtefactForm,
	createArtefactSuite,
	parseArtefactForm
} from '#lib/validation/artefact.ts';
import { summary } from '#lib/validation/helpers.ts';
import type { Actions, PageServerLoad } from './$types';

// The keepers' own new-artefact form. The public submit at /contribute, through
// the draft session and access pass; keepers stay inside /keeper, where the
// hook already requires a session (see #lib/server/keeperGuard). The fields are
// the same component; what differs is who may post and where they land.

export const load: PageServerLoad = async ({ locals }) => {
	// The hook bounces anonymous requests; this narrows the type and backs it up.
	if (!locals.user) throw redirect(303, '/keeper');
	return { locations: await knownLocations() };
};

export const actions: Actions = {
	createArtefact: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { artefactError: 'Sign in to add an artefact' });

		const form = await request.formData();
		const data = parseArtefactForm(form);
		// Keepers always record where the physical item is kept.
		const result = createArtefactSuite({ requireLocation: true })(data);
		if (!result.isValid()) {
			return fail(400, {
				artefactError: summary(result),
				errors: result.getErrors(),
				values: echoArtefactForm(form, data)
			});
		}

		// Vetted when an admin adds it, a proposed addition otherwise (see
		// `isProposedAddition`), exactly as from /contribute.
		let id: number;
		try {
			id = await createArtefact(data, {
				userId: locals.user.id,
				role: locals.user.role ?? null
			});
		} catch (error) {
			// Thrown, this would replace the form with the error page, and every
			// field and uploaded page with it. Answer as a failed submit instead,
			// so the form stays as it was and the keeper can press the button again.
			console.error('createArtefact failed', error);
			return fail(500, {
				artefactError: 'The artefact could not be saved. Nothing here is lost: try again.',
				values: echoArtefactForm(form, data)
			});
		}

		// Land on the new artefact, flagged as just created so the page shows the
		// archive number to write on the physical item.
		throw redirect(303, `/keeper/artefacts/${id}?created`);
	}
};
