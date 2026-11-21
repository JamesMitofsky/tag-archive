import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

function thrownBy(url: string): unknown {
	try {
		load({ url: new URL(url) } as never);
	} catch (error) {
		return error;
	}
}

describe('/live', () => {
	it('sends old links on to /keeper/live for good', () => {
		expect(thrownBy('http://localhost/live')).toMatchObject({
			status: 308,
			location: '/keeper/live'
		});
	});

	it('keeps the query, so ?replay still replays', () => {
		const thrown = thrownBy('http://localhost/live?replay');
		expect(isRedirect(thrown) && thrown).toMatchObject({ location: '/keeper/live?replay' });
	});
});
