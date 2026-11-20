import { describe, expect, it } from 'vitest';
import { GRANT_PARAM, grantFile, isGrantable, verifyFileGrant } from './fileGrant';
import { mintPass } from './pass';

const SECRET = 'test-secret';
const LATER = 10_000;

/** The request a browser makes for a granted `href`. */
function requestFor(href: string, method = 'GET') {
	const url = new URL(href, 'https://archive.test');
	return { pathname: url.pathname, search: url.search, method };
}

describe('file grants', () => {
	it('open exactly the file they name, until they run out', async () => {
		const href = await grantFile(SECRET, '/artefacts/Symphonic Steep Program.webp', LATER);
		expect(href).toMatch(/^\/artefacts\/Symphonic%20Steep%20Program\.webp\?grant=10000\./);
		expect(await verifyFileGrant(SECRET, requestFor(href), LATER - 1)).toBe(true);
		expect(await verifyFileGrant(SECRET, requestFor(href, 'HEAD'), LATER - 1)).toBe(true);
		expect(await verifyFileGrant(SECRET, requestFor(href), LATER)).toBe(false);
	});

	it('open no other file, and nothing with a forged or moved expiry', async () => {
		const href = await grantFile(SECRET, '/artefacts/a.webp', LATER);
		const token = new URL(href, 'https://x').searchParams.get(GRANT_PARAM)!;
		const [, signature] = token.split('.');
		const other = { ...requestFor(href), pathname: '/artefacts/b.webp' };
		expect(await verifyFileGrant(SECRET, other, 0)).toBe(false);
		const extended = requestFor(`/artefacts/a.webp?${GRANT_PARAM}=${LATER * 2}.${signature}`);
		expect(await verifyFileGrant(SECRET, extended, LATER + 1)).toBe(false);
		expect(await verifyFileGrant('another-secret', requestFor(href), 0)).toBe(false);
		expect(await verifyFileGrant(undefined, requestFor(href), 0)).toBe(false);
		for (const bad of ['', 'x', `${LATER}.`, `${LATER}.!!`, `.${signature}`]) {
			const tampered = requestFor(`/artefacts/a.webp?${GRANT_PARAM}=${bad}`);
			expect(await verifyFileGrant(SECRET, tampered, 0), bad).toBe(false);
		}
	});

	it('open reads only', async () => {
		const href = await grantFile(SECRET, '/artefacts/a.webp', LATER);
		expect(await verifyFileGrant(SECRET, requestFor(href, 'POST'), 0)).toBe(false);
		expect(await verifyFileGrant(SECRET, requestFor(href, 'PUT'), 0)).toBe(false);
	});

	it('are only ever made for the scans shipped with the deployment', async () => {
		for (const href of [
			'/',
			'/listening',
			'/api/dataset',
			'/audio/meditation-walk/01.mp3',
			'/artefacts/../api/dataset',
			'//elsewhere.test/artefacts/a.webp',
			'https://pub.r2.test/artefacts/a.webp'
		]) {
			expect(isGrantable(href), href).toBe(false);
			expect(await grantFile(SECRET, href, LATER), href).toBe(href);
		}
		expect(isGrantable('/artefacts/a.webp')).toBe(true);
	});

	it('never open anything outside /artefacts/, even with a genuine signature', async () => {
		// Sign a page's path by hand, the way a grant would be, and present it.
		const forged = (await grantFile(SECRET, '/artefacts/x', LATER)).replace('/artefacts/x', '/');
		expect(await verifyFileGrant(SECRET, requestFor(forged), 0)).toBe(false);
	});

	it('cannot be passed off as an access pass, or a pass as a grant', async () => {
		const { token } = await mintPass(SECRET, 't', 0, LATER);
		const asGrant = requestFor(`/artefacts/a.webp?${GRANT_PARAM}=${encodeURIComponent(token)}`);
		expect(await verifyFileGrant(SECRET, asGrant, 0)).toBe(false);
	});
});
