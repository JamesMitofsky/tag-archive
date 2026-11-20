import { fail, redirect } from '@sveltejs/kit';
import { createArtefact, knownLocations } from '#lib/server/artefacts.ts';
import { readDraft, submissionPrefix } from '#lib/server/drafts.ts';
import { consume, LIMITS } from '#lib/server/rateLimit.ts';
import { keyFromUrl } from '#lib/server/scans.ts';
import {
	echoArtefactForm,
	createArtefactSuite,
	parseArtefactForm
} from '#lib/validation/artefact.ts';
import { summary } from '#lib/validation/helpers.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const signedIn = !!locals.user;
	return {
		signedIn,
		// Keepers record where the physical item is kept; the public may not know.
		requireLocation: signedIn,
		// Anonymous visitors upload and submit through the draft session a tap of
		// the garden tag started (see #lib/server/drafts), for as long as their
		// access pass is open (see #lib/access/pass).
		canContribute: signedIn || (!!locals.pass && !!readDraft(cookies)),
		locations: await knownLocations()
	};
};

export const actions: Actions = {
	createArtefact: async ({ request, locals, cookies, getClientAddress }) => {
		const form = await request.formData();
		const data = parseArtefactForm(form);
		const signedIn = !!locals.user;

		// Anonymous: an open access pass (hooks set `locals.pass` even on the
		// enhanced posts the gate lets through, see #lib/access/gate), a draft
		// session (a tap), and a rate limit.
		const draft = signedIn ? null : readDraft(cookies);
		if (!signedIn) {
			if (!locals.pass || !draft) {
				return fail(401, {
					locked: true,
					artefactError:
						'The Archive has drifted shut. Visit the Cube to open the Archive, then press “Add artefact” — your entry is kept.'
				});
			}
			if (!(await consume('submit-ip', getClientAddress(), LIMITS.submitPerIp))) {
				return fail(429, { artefactError: 'Too many submissions — wait a little and try again.' });
			}
		}

		const result = createArtefactSuite({ requireLocation: signedIn })(data);
		if (!result.isValid()) {
			return fail(400, {
				artefactError: summary(result),
				errors: result.getErrors(),
				values: echoArtefactForm(form, data)
			});
		}

		// An anonymous submission may only attach images from its own draft space:
		// never an arbitrary URL, never someone else's upload.
		if (draft) {
			const prefix = submissionPrefix(draft.id);
			const own = data.fileUrls.every((url) => keyFromUrl(url)?.startsWith(prefix));
			if (!own) return fail(400, { artefactError: 'Those images could not be attached.' });
		}

		let id: number;
		try {
			id = await createArtefact(data, {
				userId: locals.user?.id ?? null,
				role: locals.user?.role ?? null
			});
		} catch (error) {
			// Thrown, this would replace the form with the error page, and every
			// field and uploaded page with it. Answer as a failed submit instead.
			console.error('createArtefact failed', error);
			return fail(500, {
				artefactError: 'The artefact could not be saved. Nothing here is lost: try again.',
				values: echoArtefactForm(form, data)
			});
		}

		// Both get the archive number to write on the physical item: keepers on
		// the new artefact's page, flagged as just created; the public here, in
		// place of the form (they can't open a keeper page).
		if (signedIn) throw redirect(303, `/keeper/artefacts/${id}?created`);
		return { submitted: { id } };
	}
};
