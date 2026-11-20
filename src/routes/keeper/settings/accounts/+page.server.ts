import { fail, redirect } from '@sveltejs/kit';
import { isRole, ROLES } from '#lib/roles.ts';
import { listAccounts, setAccountRole } from '#lib/server/accounts.ts';
import { countListenerArtefacts } from '#lib/server/listeners.ts';
import { str } from '#lib/validation/helpers.ts';
import type { Actions, PageServerLoad } from './$types';

// Accounts: admins see every account and change its role here (see #lib/roles).

function requireAdmin(locals: App.Locals): string {
	// Re-checked on the action as well as the load: load guards don't protect POSTs.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');
	return locals.user.id;
}

export const load: PageServerLoad = async ({ locals }) => {
	const selfId = requireAdmin(locals);
	const [accounts, given] = await Promise.all([listAccounts(), countListenerArtefacts()]);
	// How many artefacts each listener may view (see #lib/server/listeners).
	const artefactCounts = Object.fromEntries(given);
	return { accounts, artefactCounts, roles: ROLES, selfId };
};

export const actions: Actions = {
	setRole: async ({ request, locals }) => {
		const actorId = requireAdmin(locals);
		const fd = await request.formData();
		const id = str(fd.get('id'));
		const role = str(fd.get('role'));
		if (!id) return fail(400, { id, error: 'No account given' });
		if (!isRole(role)) return fail(400, { id, error: 'Pick a role' });

		const outcome = await setAccountRole(actorId, id, role);
		if (outcome === 'self') return fail(400, { id, error: 'You can’t change your own role' });
		if (outcome === 'missing') return fail(404, { id, error: 'That account no longer exists' });
		return { updated: { id, role } };
	}
};
