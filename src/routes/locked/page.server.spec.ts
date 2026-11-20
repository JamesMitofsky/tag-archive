import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

const pass = (kind: string) => ({ kind, issuedAt: 0, expiresAt: Infinity });

function run(locals: object) {
	try {
		load({ locals } as never);
		return null;
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}
}

describe('/locked', () => {
	it('shows the locked page to anyone without a pass', () => {
		expect(run({})).toBeNull();
	});

	it('moves on to the archive once the visitor holds a pass that opens it', () => {
		expect(run({ pass: pass('t') })).toMatchObject({ status: 303, location: '/' });
	});

	it('moves a signed-in listener on to their own page', () => {
		const listener = { id: 'l', role: 'listener' };
		expect(run({ listener, listenerPass: pass('l') })).toMatchObject({ location: '/listening' });
		expect(run({ listener })).toMatchObject({ location: '/listening' });
	});

	it('stays put for a listener’s pass without its session, which /listening sends back here', () => {
		expect(run({ listenerPass: pass('l') })).toBeNull();
	});
});
