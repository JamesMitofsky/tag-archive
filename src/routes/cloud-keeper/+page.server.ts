import { fail } from '@sveltejs/kit';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { z } from 'zod';
import { APIError } from 'better-auth';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { attachProvenance } from '$lib/server/db/queries';
import { artefact, event } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const otpSchema = z
	.string()
	.trim()
	.regex(/^\d{6}$/, 'Code is 6 digits');

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { user: null, artefacts: [] };

	// Join the event in and flatten its name to `event` (see ArtefactWithEvent).
	const rows = await db
		.select({ ...getTableColumns(artefact), event: event.name })
		.from(artefact)
		.leftJoin(event, eq(artefact.eventId, event.id))
		.orderBy(desc(artefact.date), desc(artefact.id));
	// Re-expand provenance names from the join table onto each artefact.
	const artefacts = await attachProvenance(rows);

	return {
		user: { email: locals.user.email, role: locals.user.role },
		artefacts
	};
};

export const actions: Actions = {
	sendOtp: async ({ request }) => {
		const form = await request.formData();
		const parsed = emailSchema.safeParse(form.get('email'));
		if (!parsed.success) {
			return fail(400, { step: 'email' as const, error: 'Enter a valid email address' });
		}

		try {
			await auth.api.sendVerificationOTP({ body: { email: parsed.data, type: 'sign-in' } });
		} catch (e) {
			console.error('[cloud-keeper] failed to send OTP', e);
			return fail(500, {
				step: 'email' as const,
				email: parsed.data,
				error: 'Could not send the code. Try again in a moment.'
			});
		}

		return { step: 'otp' as const, email: parsed.data };
	},

	verifyOtp: async ({ request }) => {
		const form = await request.formData();
		const email = emailSchema.safeParse(form.get('email'));
		const otp = otpSchema.safeParse(form.get('otp'));
		if (!email.success) {
			return fail(400, { step: 'email' as const, error: 'Enter a valid email address' });
		}
		if (!otp.success) {
			return fail(400, {
				step: 'otp' as const,
				email: email.data,
				error: otp.error.issues[0].message
			});
		}

		try {
			// sveltekitCookies (last auth plugin) sets the session cookie on this event.
			await auth.api.signInEmailOTP({
				body: { email: email.data, otp: otp.data },
				headers: request.headers
			});
		} catch (e) {
			const message =
				e instanceof APIError
					? 'That code is wrong or expired. Request a new one.'
					: 'Sign-in failed. Try again.';
			if (!(e instanceof APIError)) console.error('[cloud-keeper] OTP sign-in failed', e);
			return fail(400, { step: 'otp' as const, email: email.data, error: message });
		}

		return { step: 'signed-in' as const };
	},

	signOut: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		return { step: 'email' as const };
	},

	deleteArtefact: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { artefactError: 'Sign in first' });
		// Server-side role gate — the UI hides the button, but this is the enforcement.
		if (locals.user.role !== 'admin') {
			return fail(403, { artefactError: 'Only admins can delete artefacts' });
		}

		const form = await request.formData();
		const id = z.coerce.number().int().positive().safeParse(form.get('id'));
		if (!id.success) return fail(400, { artefactError: 'Unknown artefact' });

		await db.delete(artefact).where(eq(artefact.id, id.data));
		return { deleted: true };
	}
};
