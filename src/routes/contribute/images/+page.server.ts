import { fail, redirect } from '@sveltejs/kit';
import { client } from '$lib/server/db';
import { readDraft } from '$lib/server/drafts';
import { createImageSet } from '$lib/server/imageSets';
import { requestOwner } from '$lib/server/imageUploads';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { sign, verify } from '$lib/server/signing';
import { createContactSuite, parseContactForm } from '$lib/validation/contact';
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
 * Proof that whoever holds it just submitted image set `id` — handed back after
 * an anonymous submission so the optional contact form can attach to it. Its
 * own purpose, apart from the artefact form's 'contact': ids are only unique
 * per table, so a token for artefact 7 must never open image set 7, nor the
 * other way round.
 */
const CONTACT_PURPOSE = 'contact-image-set';
const contactToken = (id: number) => sign(CONTACT_PURPOSE, String(id));

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
		// thank-you (with the optional way to leave contact details) instead.
		if (signedIn) throw redirect(303, `/keeper/images/${created.id}?created`);
		return { submitted: { id: created.id, token: contactToken(created.id) } };
	},

	connect: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const id = Number(form.get('setId'));
		const token = String(form.get('token') ?? '');
		if (!Number.isSafeInteger(id) || !verify(CONTACT_PURPOSE, String(id), token)) {
			return fail(403, { contactError: 'That link has expired.' });
		}
		// From here on the token is good, so every answer hands it back: the
		// thank-you (and its contact form) stays on screen to show the message.
		const submitted = { id, token };
		if (!(await consume('connect-ip', getClientAddress(), LIMITS.connectPerIp))) {
			return fail(429, {
				contactError: 'Too many attempts — wait a little and try again.',
				submitted
			});
		}

		const data = parseContactForm(form);
		const result = createContactSuite()(data);
		if (!result.isValid()) {
			return fail(400, {
				contactError: summary(result),
				contactErrors: result.getErrors(),
				submitted
			});
		}

		// Only while the set is still awaiting review: once a keeper has vetted (or
		// rejected) it, the token no longer opens anything. One statement, so the
		// check and the write can't be split by a review landing in between — a
		// rejection would otherwise turn the insert into a foreign-key failure.
		// Raw SQL bypasses Drizzle's `$onUpdate`, so a repeat stamps `updated_at`
		// (epoch ms) itself; the insert takes the column defaults.
		const saved = await client.execute({
			sql: `INSERT INTO image_set_contact (set_id, name, email, created_by, updated_by)
				SELECT id, ?, ?, NULL, NULL FROM image_set WHERE id = ? AND proposed_addition = 1
				ON CONFLICT (set_id) DO UPDATE SET name = excluded.name, email = excluded.email, updated_at = ?`,
			args: [data.name || null, data.email || null, id, Date.now()]
		});
		if (saved.rowsAffected === 0) {
			return fail(410, { contactError: 'That submission has already been reviewed.', submitted });
		}

		return { connected: true, submitted };
	}
};
