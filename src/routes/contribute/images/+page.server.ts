import { fail, redirect } from '@sveltejs/kit';
import { readDraft } from '$lib/server/drafts';
import { createImageSet } from '$lib/server/imageSets';
import { requestOwner } from '$lib/server/imageUploads';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { summary } from '$lib/validation/helpers';
import {
	createImageSetSuite,
	parseImageSetForm,
	type ImageSetData
} from '$lib/validation/imageSet';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) form values echoed back so a failed submit keeps input. */
export type ImageSetFormValues = {
	description: string;
	event: string;
	imageIds: number[];
};

/**
 * The "tap again" refusal: shown in place, so the photographs already added
 * stay put. A tap doesn't restart the uploads the lapse stopped, and the form
 * holds its submit until they are tried again (or removed), so it says to.
 */
const locked = () =>
	fail(401, {
		locked: true,
		imageSetError:
			'The Archive has drifted shut. Visit the Cube to open the Archive, press “Try again” on any photographs marked “Not uploaded”, then “Add to the archive” — your entry is kept.'
	});

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const signedIn = !!locals.user;
	return {
		signedIn,
		// The same rule as /contribute: anonymous visitors upload and submit through
		// the draft session a tap started (see $lib/server/drafts), while their
		// access pass is open (see $lib/access/pass).
		canContribute: signedIn || (!!locals.pass && !!readDraft(cookies))
	};
};

export const actions: Actions = {
	createImageSet: async (event) => {
		const { request, locals, cookies, getClientAddress } = event;
		const form = await request.formData();
		// A new set's date always follows its photographs (see `createImageSet`);
		// the form's hidden `dateAuto` only says so to the shared suite, so a post
		// without it is still read the same way rather than refused over a date
		// field this form doesn't have.
		const data: ImageSetData = { ...parseImageSetForm(form), dateAuto: true };
		const signedIn = !!locals.user;

		// Anonymous: an open access pass (hooks set `locals.pass` even on the
		// enhanced posts the gate lets through, see $lib/access/gate), a draft
		// session (a tap), and a rate limit.
		if (!signedIn) {
			if (!locals.pass || !readDraft(cookies)) return locked();
			if (!(await consume('submit-ip', getClientAddress(), LIMITS.submitPerIp))) {
				return fail(429, { imageSetError: 'Too many submissions — wait a little and try again.' });
			}
		}

		const values: ImageSetFormValues = {
			description: String(form.get('description') ?? ''),
			event: String(form.get('event') ?? ''),
			imageIds: data.imageIds.filter((id) => Number.isSafeInteger(id))
		};

		const result = createImageSetSuite()(data);
		if (!result.isValid()) {
			return fail(400, {
				imageSetError: summary(result),
				errors: result.getErrors(),
				values
			});
		}

		// Whose uploads these may be: the keeper's own, or this draft's (see
		// `ownsImage`). Ids come from the browser, so `createImageSet` re-checks
		// every one against this owner rather than trusting them.
		const owner = requestOwner(event);
		if (!owner) return locked();

		const created = await createImageSet(
			data,
			{ userId: locals.user?.id ?? null, role: locals.user?.role ?? null },
			owner
		);
		if (!created.ok) return fail(400, { imageSetError: created.message, values });

		// Keepers land on the new set, flagged as just created; the public get a
		// thank-you instead.
		if (signedIn) throw redirect(303, `/keeper/images/${created.id}?created`);
		return { submitted: { id: created.id } };
	}
};
