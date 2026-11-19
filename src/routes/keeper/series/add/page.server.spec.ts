import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('/keeper/series/add', () => {
	it('sends old links on to /keeper/series/new for good', () => {
		let thrown: unknown;
		try {
			load({} as never);
		} catch (error) {
			thrown = error;
		}
		expect(isRedirect(thrown) && thrown).toMatchObject({
			status: 308,
			location: '/keeper/series/new'
		});
	});
});
