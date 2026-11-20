import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('/keeper/events/add', () => {
	it('sends old links on to /keeper/events/new for good', () => {
		let thrown: unknown;
		try {
			load({} as never);
		} catch (error) {
			thrown = error;
		}
		expect(isRedirect(thrown) && thrown).toMatchObject({
			status: 308,
			location: '/keeper/events/new'
		});
	});
});
