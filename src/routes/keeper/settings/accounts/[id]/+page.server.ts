import { error, fail, redirect } from '@sveltejs/kit';
import { getAccount, listArtefactChoices, setListenerArtefacts } from '#lib/server/listeners.ts';
import type { Actions, PageServerLoad } from './$types';

// Which artefacts a listener's account may view (see #lib/roles): admins tick
// them here, from the account's row at Settings → Accounts.

function requireAdmin(locals: App.Locals): string {
	// Re-checked on the action as well as the load: load guards don't protect POSTs.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');
	return locals.user.id;
}

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals);
	const account = await getAccount(params.id);
	if (!account) throw error(404, 'That account no longer exists');
	const isListener = account.role === 'listener';
	return {
		account: { id: account.id, name: account.name, email: account.email, role: account.role },
		isListener,
		choices: isListener ? await listArtefactChoices(account.id) : []
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const actorId = requireAdmin(locals);
		const fd = await request.formData();
		const ids = fd
			.getAll('artefact')
			.map((value) => Number(value))
			.filter((id) => Number.isSafeInteger(id) && id > 0);

		const outcome = await setListenerArtefacts(actorId, params.id, ids);
		if (outcome === 'missing') return fail(404, { error: 'That account no longer exists' });
		if (outcome === 'not-listener') {
			return fail(400, { error: 'Only a listener’s artefacts are chosen here' });
		}
		return { saved: true };
	}
};
