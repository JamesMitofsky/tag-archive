import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth';
import { auth } from '$lib/server/auth';
import { sendAccountCreatedEmail } from '$lib/server/email';
import { ASSIGNABLE_ROLES, createNewUserSuite, parseCreateUserForm } from '$lib/validation/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Creating accounts + assigning roles is an admin-only tool.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');

	return {
		user: { email: locals.user.email, role: locals.user.role },
		roles: ASSIGNABLE_ROLES
	};
};

export const actions: Actions = {
	createUser: async ({ request, locals }) => {
		// Re-check on the action itself: load-guards don't protect POSTs.
		if (!locals.user || locals.user.role !== 'admin') throw redirect(303, '/keeper');

		const form = await request.formData();
		const { name, email, role } = parseCreateUserForm(form);
		const result = createNewUserSuite()({ name, email, role });
		if (!result.isValid()) {
			return fail(400, { name, email, role, errors: result.getErrors() });
		}

		try {
			// No password: OTP-only users have no credential account. Passing the
			// admin's headers authorises the privileged create-user endpoint.
			await auth.api.createUser({
				// `role`'s type is the plugin's built-in union ('user' | 'admin'); this
				// app defines its own roles ('contributor' | 'admin') that the type
				// inference doesn't see. The value is validated above, so cast past it.
				body: { name, email, role: role as 'admin' },
				headers: request.headers
			});
		} catch (e) {
			if (e instanceof APIError) {
				// Most likely: email already taken. Surface it on the email field.
				return fail(400, { name, email, role, errors: { email: [e.message] } });
			}
			console.error('[create-user] failed', e);
			return fail(500, { name, email, role, error: 'Could not create the account. Try again.' });
		}

		// Let the new user know they can sign in. Non-fatal: the account already
		// exists, so a send failure must not turn a success into an error.
		try {
			await sendAccountCreatedEmail(email, name, role);
		} catch (e) {
			console.error('[create-user] account-created email failed', e);
		}

		return { created: { name, email, role } };
	}
};
