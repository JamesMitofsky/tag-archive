import { error, fail, redirect } from '@sveltejs/kit';
import {
	computeSetDate,
	deleteImageSet as deleteSet,
	loadImageSet,
	STALE_REFUSAL,
	updateImageSet as saveSet
} from '$lib/server/imageSets';
import { toUploadedImage } from '$lib/server/imageUploads';
import { idSchema } from '$lib/schemas';
import { createImageSetSuite, parseImageSetForm } from '$lib/validation/imageSet';
import { summary } from '$lib/validation/helpers';
import type { Actions, PageServerLoad } from './$types';

/**
 * Raw (unvalidated) edit-form values echoed back so a failed submit keeps
 * input. The photographs aren't among them: the uploader keeps its own list
 * through an enhanced submit, and can't be re-seeded with fresh uploads.
 */
export type ImageSetFormValues = {
	description: string;
	event: string;
	date: string;
	dateAuto: boolean;
};

const echo = (form: FormData, dateAuto: boolean): ImageSetFormValues => ({
	description: String(form.get('description') ?? ''),
	event: String(form.get('event') ?? ''),
	date: String(form.get('date') ?? ''),
	dateAuto
});

export const load: PageServerLoad = async ({ params, locals }) => {
	// Editing is admin-only; bounce anyone else back to the set's page.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, `/keeper/images/${params.id}`);

	const id = idSchema.safeParse(params.id);
	if (!id.success) throw error(404, 'Image set not found');

	const set = await loadImageSet(id.data);
	if (!set) throw error(404, 'Image set not found');

	// The uploader shows the photographs already in the set as uploaded ones;
	// their metadata stays on the detail page.
	return {
		user: { email: locals.user.email, role: locals.user.role },
		set: {
			id: set.id,
			description: set.description,
			event: set.event,
			date: set.date,
			dateAuto: set.dateAuto,
			images: set.images.map(toUploadedImage),
			// When the set last changed, in ms: the save sends it back, and is
			// refused once anything (another save, an approval) has moved it on.
			version: set.updatedAt.getTime()
		},
		// What the photographs alone give, for the read-only date while it follows
		// them — the stored date may be a hand-set override.
		photographDate: await computeSetDate(set.id)
	};
};

export const actions: Actions = {
	updateImageSet: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { setError: 'Sign in to edit an image set' });
		if (locals.user.role !== 'admin') {
			return fail(403, { setError: 'Only admins can edit image sets' });
		}
		const userId = locals.user.id;

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { setError: 'Unknown image set' });

		const form = await request.formData();
		const data = parseImageSetForm(form);
		const result = createImageSetSuite()(data);
		if (!result.isValid()) {
			return fail(400, {
				setError: summary(result),
				errors: result.getErrors(),
				values: echo(form, data.dateAuto)
			});
		}

		// Membership, order, removals and the date all settle in here; a refusal
		// (the set changed since the page loaded, a photograph claimed elsewhere,
		// the set deleted meanwhile) leaves the set as it was. A page sent with no
		// version reads as NaN, which no set is at: it's refused as changed.
		const version = Number(form.get('version') ?? NaN);
		const saved = await saveSet(id.data, data, userId, { version });
		if (!saved.ok) {
			return fail(400, { setError: saved.message, values: echo(form, data.dateAuto) });
		}

		// Back to the set's page so the edits show.
		throw redirect(303, `/keeper/images/${id.data}`);
	},

	deleteImageSet: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { setError: 'Sign in to delete an image set' });
		// Server-side role gate — the UI hides the button, but this is the enforcement.
		if (locals.user.role !== 'admin') {
			return fail(403, { setError: 'Only admins can delete image sets' });
		}

		const id = idSchema.safeParse(params.id);
		if (!id.success) return fail(400, { setError: 'Unknown image set' });

		// Takes the photographs with it, rows and stored originals — but only the
		// set as this page showed it: one changed since (another admin's save)
		// may hold photographs nobody here has seen. A missing or unreadable
		// version reads as NaN, which no set is at. Already gone (a second tab,
		// say) ends in the same place as deleted.
		const version = Number((await request.formData()).get('version') ?? NaN);
		if (!(await deleteSet(id.data, { version })) && (await loadImageSet(id.data))) {
			return fail(409, { setError: STALE_REFUSAL });
		}
		// Nothing left to show here — back to the images list.
		throw redirect(303, '/keeper/images');
	}
};
