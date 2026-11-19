import { fail, type RequestEvent } from '@sveltejs/kit';
import { approveProposed, rejectProposed, type ReviewKind } from '#lib/server/db/queries.ts';
import { idSchema } from '#lib/schemas.ts';

/**
 * The `approve` / `reject` form actions for one kind of proposed row, gated to
 * admins. Any page that renders `ReviewActions` for that kind spreads these into
 * its `actions`, so the review queue and the artefacts list vet a submission
 * through the same checks.
 *
 * `noun` names the row in the "Unknown …" error, e.g. 'artefact'.
 */
export function reviewActions(kind: ReviewKind, noun: string) {
	// The row id from the posted form, or the failure to return when the caller
	// can't review or the id doesn't parse.
	async function authorize({ request, locals }: RequestEvent) {
		if (!locals.user) return fail(401, { reviewError: 'Sign in to review submissions' });
		if (locals.user.role !== 'admin') {
			return fail(403, { reviewError: 'Only admins can review submissions' });
		}
		const id = idSchema.safeParse((await request.formData()).get('id'));
		if (!id.success) return fail(400, { reviewError: `Unknown ${noun}` });
		return { id: id.data, userId: locals.user.id };
	}

	return {
		approve: async (event: RequestEvent) => {
			const auth = await authorize(event);
			if (!('id' in auth)) return auth;
			await approveProposed(kind, auth.id, auth.userId);
			return { approved: true };
		},

		reject: async (event: RequestEvent) => {
			const auth = await authorize(event);
			if (!('id' in auth)) return auth;
			await rejectProposed(kind, auth.id, auth.userId);
			return { rejected: true };
		}
	};
}
