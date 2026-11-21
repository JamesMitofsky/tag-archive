import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

type Caller = { role: string } | null;

async function visit(caller: Caller): Promise<unknown> {
	try {
		return await load({ locals: caller ? { user: caller } : {} } as never);
	} catch (error) {
		return error;
	}
}

describe('/keeper/live', () => {
	it('opens for an admin', async () => {
		const result = await visit({ role: 'admin' });
		expect(isRedirect(result)).toBe(false);
	});

	it('sends a contributor back to settings', async () => {
		const thrown = await visit({ role: 'contributor' });
		expect(isRedirect(thrown) && thrown).toMatchObject({
			status: 303,
			location: '/keeper/settings'
		});
	});

	it('sends anyone signed out to sign-in', async () => {
		const thrown = await visit(null);
		expect(isRedirect(thrown) && thrown).toMatchObject({ status: 303, location: '/keeper' });
	});
});
