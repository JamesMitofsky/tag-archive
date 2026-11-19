import { fail, redirect } from '@sveltejs/kit';
import { KEY_PARAM } from '$lib/access/key.server';
import { createKey, deleteKey, endKey, listKeys, setKeyExpiry } from '$lib/server/remoteKeys';
import { str } from '$lib/validation/helpers';
import {
	createExpirySuite,
	createRemoteKeySuite,
	DEFAULT_KEY_DAYS,
	parseExpiryForm,
	parseRemoteKeyForm,
	utcDate
} from '$lib/validation/remoteKey';
import type { Actions, PageServerLoad } from './$types';

// Unlock keys (see $lib/access/key.server): admins hand them out here, each
// with the date it stops opening the archive, and close them early.

function requireAdmin(locals: App.Locals): void {
	// Re-checked on every action as well as the load: load guards don't protect POSTs.
	if (!locals.user) throw redirect(303, '/keeper');
	if (locals.user.role !== 'admin') throw redirect(303, '/keeper/settings');
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals);
	return {
		keys: await listKeys(),
		// The link a key opens the archive through; the page appends the key.
		linkBase: `${url.origin}/?${KEY_PARAM}=`,
		today: utcDate(),
		defaultExpiresOn: utcDate(new Date(), DEFAULT_KEY_DAYS)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);
		const data = parseRemoteKeyForm(await request.formData());
		const result = createRemoteKeySuite()(data);
		if (!result.isValid()) return fail(400, { create: { ...data, errors: result.getErrors() } });

		if ((await createKey(data.key, data.expiresOn)) === 'taken') {
			return fail(400, {
				create: { ...data, errors: { key: ['That key is already in use'] } }
			});
		}
		return { created: data.key };
	},

	setExpiry: async ({ request, locals }) => {
		requireAdmin(locals);
		const fd = await request.formData();
		const key = str(fd.get('key'));
		const data = parseExpiryForm(fd);
		const result = createExpirySuite()(data);
		if (!result.isValid()) {
			return fail(400, { edit: { key, ...data, errors: result.getErrors() } });
		}
		if (!(await setKeyExpiry(key, data.expiresOn))) return fail(404, { missing: key });
		return { updated: key };
	},

	end: async ({ request, locals }) => {
		requireAdmin(locals);
		const key = str((await request.formData()).get('key'));
		if (!(await endKey(key))) return fail(404, { missing: key });
		return { ended: key };
	},

	delete: async ({ request, locals }) => {
		requireAdmin(locals);
		const key = str((await request.formData()).get('key'));
		if (!(await deleteKey(key))) return fail(404, { missing: key });
		return { deleted: key };
	}
};
