import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNormalizedImage } from './imageBytes';

const ORIGIN = 'https://archive.example';
const SCAN = 'https://pub-abc.r2.dev/scan one.webp';

function imageResponse(contentType: string, body = 'bytes') {
	return new Response(body, { status: 200, headers: { 'content-type': contentType } });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

/** Stub fetch with a per-URL responder; returns the list of URLs actually requested. */
function stubFetch(responder: (url: string) => Response | Promise<Response>) {
	const calls: string[] = [];
	vi.stubGlobal('fetch', (input: string | URL) => {
		const url = String(input);
		calls.push(url);
		return Promise.resolve(responder(url));
	});
	return calls;
}

describe('fetchNormalizedImage', () => {
	it('transcodes through the Netlify Image CDN, percent-encoding the source URL', async () => {
		const calls = stubFetch(() => imageResponse('image/jpeg'));

		const image = await fetchNormalizedImage(SCAN, ORIGIN);

		expect(image).toEqual({ bytes: new Uint8Array(Buffer.from('bytes')), type: 'jpg' });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toBe(
			`${ORIGIN}/.netlify/images?url=${encodeURIComponent(SCAN)}&w=1600&q=75&fm=jpg`
		);
	});

	it('falls back to the source URL when the CDN is absent, as under plain vite dev', async () => {
		const calls = stubFetch((url) =>
			url.includes('/.netlify/images')
				? new Response('nope', { status: 404 })
				: imageResponse('image/png')
		);

		const image = await fetchNormalizedImage(SCAN, ORIGIN);

		expect(image?.type).toBe('png');
		expect(calls).toHaveLength(2);
	});

	it('gives up on a format pdf-lib cannot embed rather than returning bad bytes', async () => {
		stubFetch((url) =>
			url.includes('/.netlify/images')
				? new Response('nope', { status: 404 })
				: imageResponse('image/webp')
		);

		await expect(fetchNormalizedImage(SCAN, ORIGIN)).resolves.toBeNull();
	});

	it('treats a transport failure as a missing image, not a crash', async () => {
		vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));

		await expect(fetchNormalizedImage(SCAN, ORIGIN)).resolves.toBeNull();
	});
});
