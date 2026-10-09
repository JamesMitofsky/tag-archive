import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { createArtefact, knownLocations } from '$lib/server/artefacts';
import { db } from '$lib/server/db';
import { stampInsert } from '$lib/server/db/audit';
import { artefact, submissionContact } from '$lib/server/db/schema';
import { freshDraft, submissionPrefix } from '$lib/server/drafts';
import { consume, LIMITS } from '$lib/server/rateLimit';
import { keyFromUrl } from '$lib/server/scans';
import { sign, verify } from '$lib/server/signing';
import { createArtefactSuite, parseArtefactForm } from '$lib/validation/artefact';
import { createContactSuite, parseContactForm } from '$lib/validation/contact';
import { summary } from '$lib/validation/helpers';
import type { Actions, PageServerLoad } from './$types';

/** Raw (unvalidated) form values echoed back so a failed submit keeps input. */
export type ArtefactFormValues = {
	artefact: string;
	event: string;
	date: string;
	description: string;
	location: string;
	fileUrls: string[];
	/** Comma-separated in the form; kept raw so a failed submit doesn't lose it. */
	provenance: string;
	programArea: string[];
};

/**
 * Proof that whoever holds it just submitted artefact `id` — handed back after
 * an anonymous submission so the optional contact form can attach to it,
 * without an account and without letting anyone attach contact details to an
 * artefact they didn't submit.
 */
const contactToken = (id: number) => sign('contact', String(id));

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const signedIn = !!locals.user;
	return {
		signedIn,
		// Keepers record where the physical item is kept; the public may not know.
		requireLocation: signedIn,
		// Anonymous visitors upload and submit through the draft session a recent
		// tap of the garden tag started (see $lib/server/drafts).
		canContribute: signedIn || !!freshDraft(cookies),
		locations: await knownLocations()
	};
};

export const actions: Actions = {
	createArtefact: async ({ request, locals, cookies, getClientAddress }) => {
		const form = await request.formData();
		const data = parseArtefactForm(form);
		const signedIn = !!locals.user;

		// Anonymous: a fresh draft session (a recent tap) and a rate limit.
		const draft = signedIn ? null : freshDraft(cookies);
		if (!signedIn) {
			if (!draft) {
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
				values: {
					artefact: String(form.get('artefact') ?? ''),
					event: String(form.get('event') ?? ''),
					date: String(form.get('date') ?? ''),
					description: String(form.get('description') ?? ''),
					location: String(form.get('location') ?? ''),
					fileUrls: data.fileUrls,
					provenance: String(form.get('provenance') ?? ''),
					programArea: data.programArea
				} satisfies ArtefactFormValues
			});
		}

		// An anonymous submission may only attach images from its own draft space:
		// never an arbitrary URL, never someone else's upload.
		if (draft) {
			const prefix = submissionPrefix(draft.id);
			const own = data.fileUrls.every((url) => keyFromUrl(url)?.startsWith(prefix));
			if (!own) return fail(400, { artefactError: 'Those images could not be attached.' });
		}

		const id = await createArtefact(data, {
			userId: locals.user?.id ?? null,
			role: locals.user?.role ?? null
		});

		// Keepers land on the new artefact; the public get a thank-you (with the
		// optional way to leave contact details) instead.
		if (signedIn) throw redirect(303, `/keeper/artefacts/${id}`);
		return { submitted: { id, token: contactToken(id) } };
	},

	connect: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const id = Number(form.get('artefactId'));
		const token = String(form.get('token') ?? '');
		if (!Number.isSafeInteger(id) || !verify('contact', String(id), token)) {
			return fail(403, { contactError: 'That link has expired.' });
		}
		if (!(await consume('connect-ip', getClientAddress(), LIMITS.connectPerIp))) {
			return fail(429, { contactError: 'Too many attempts — wait a little and try again.' });
		}

		const data = parseContactForm(form);
		const result = createContactSuite()(data);
		if (!result.isValid()) {
			return fail(400, {
				contactError: summary(result),
				contactErrors: result.getErrors(),
				submitted: { id, token }
			});
		}

		// Only while the submission is still awaiting review: once a keeper has
		// vetted (or rejected) it, the token no longer opens anything.
		const [pending] = await db
			.select({ id: artefact.id })
			.from(artefact)
			.where(and(eq(artefact.id, id), eq(artefact.proposedAddition, true)));
		if (!pending) return fail(410, { contactError: 'That submission has already been reviewed.' });

		const contact = { name: data.name || null, email: data.email || null };
		await db
			.insert(submissionContact)
			.values({ artefactId: id, ...contact, ...stampInsert(null) })
			.onConflictDoUpdate({ target: submissionContact.artefactId, set: contact });

		return { connected: true, submitted: { id, token } };
	}
};
