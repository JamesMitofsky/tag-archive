import { describe, expect, it } from 'vitest';
import {
	AlbumFormatError,
	SharedAlbumClient,
	parseAlbumToken,
	parseAssetUrls,
	parseStream,
	pickDerivatives,
	type AlbumItem,
	type Fetch
} from './sharedAlbum';

const TOKEN = 'B0aBcDeFgHiJkLmN_op-QrStUv';
const PHOTO = '11111111-AAAA-4BBB-8CCC-000000000001';
const VIDEO = '11111111-AAAA-4BBB-8CCC-000000000002';
const BATCH = '22222222-AAAA-4BBB-8CCC-000000000001';

/** A webstream answer as Apple writes one: every number a string. */
function stream(overrides: Record<string, unknown> = {}) {
	return {
		streamName: 'Garden days',
		streamCtag: 'FT=-@RU=x@S=1',
		itemsReturned: '0',
		photos: [
			{
				photoGuid: PHOTO,
				batchGuid: BATCH,
				dateCreated: '2026-05-16T17:42:00Z',
				batchDateCreated: '2026-05-17T09:00:00Z',
				caption: '  Setting up  ',
				contributorFullName: 'A Keeper',
				width: '1639',
				height: '2049',
				derivatives: {
					'333': { fileSize: '41919', checksum: 'aa01', width: '266', height: '333' },
					'2049': { fileSize: '1381800', checksum: 'aa02', width: '1639', height: '2049' }
				}
			},
			{
				photoGuid: VIDEO.toLowerCase(),
				batchGuid: BATCH,
				mediaAssetType: 'video',
				dateCreated: '2026-05-16T18:00:00Z',
				batchDateCreated: '2026-05-17T09:00:00Z',
				caption: '',
				derivatives: {
					PosterFrame: {
						fileSize: '97387',
						checksum: 'bb01',
						width: '1280',
						height: '720',
						state: 'available'
					},
					'360p': {
						fileSize: '2950550',
						checksum: 'bb02',
						width: '640',
						height: '360',
						state: 'available'
					},
					'720p': {
						fileSize: '8847178',
						checksum: 'bb03',
						width: '1280',
						height: '720',
						state: 'available'
					}
				}
			}
		],
		...overrides
	};
}

describe('parseAlbumToken', () => {
	it('reads the token from a shared album link', () => {
		expect(parseAlbumToken(`https://www.icloud.com/sharedalbum/#${TOKEN}`)).toBe(TOKEN);
	});

	it('drops the photo a link opens on', () => {
		expect(parseAlbumToken(`https://www.icloud.com/sharedalbum/#${TOKEN};${PHOTO}`)).toBe(TOKEN);
	});

	it('takes a localized link and a bare token', () => {
		expect(parseAlbumToken(`https://www.icloud.com/sharedalbum/en-us/#${TOKEN}`)).toBe(TOKEN);
		expect(parseAlbumToken(`  ${TOKEN}\n`)).toBe(TOKEN);
	});

	it('refuses links to anywhere else', () => {
		expect(parseAlbumToken(`https://evil.example/sharedalbum/#${TOKEN}`)).toBeNull();
		expect(parseAlbumToken(`http://www.icloud.com/sharedalbum/#${TOKEN}`)).toBeNull();
		expect(parseAlbumToken(`https://www.icloud.com/photos/#${TOKEN}`)).toBeNull();
		expect(parseAlbumToken('https://www.icloud.com/sharedalbum/#../../x')).toBeNull();
		expect(parseAlbumToken('')).toBeNull();
	});
});

describe('parseStream', () => {
	it('reads the album, numbers as numbers and guids uppercased', () => {
		const album = parseStream(stream());
		expect(album.name).toBe('Garden days');
		const [photo, video] = album.items;
		expect(photo).toMatchObject({
			guid: PHOTO,
			kind: 'photo',
			batchGuid: BATCH,
			postedAt: '2026-05-16T17:42:00Z',
			contributor: 'A Keeper',
			caption: 'Setting up'
		});
		expect(photo.derivatives).toContainEqual({
			key: '2049',
			checksum: 'aa02',
			bytes: 1381800,
			width: 1639,
			height: 2049,
			state: null
		});
		expect(video).toMatchObject({ guid: VIDEO, kind: 'video', contributor: null, caption: null });
	});

	it('fails loudly, naming the field, when Apple changes the shape', () => {
		const changed = stream();
		(changed.photos[0].derivatives['2049'] as Record<string, unknown>).fileSize = 1381800;
		expect(() => parseStream(changed)).toThrow(AlbumFormatError);
		expect(() => parseStream(changed)).toThrow(/photos\.0\.derivatives\.2049\.fileSize/);
		expect(() => parseStream({ photos: [] })).toThrow(/streamName/);
	});
});

describe('pickDerivatives', () => {
	const [photo, video] = parseStream(stream()).items;

	it("takes a photograph's largest size", () => {
		expect(pickDerivatives(photo)).toMatchObject({ kind: 'photo', photo: { key: '2049' } });
	});

	it("takes a video's largest rendition and its poster frame", () => {
		expect(pickDerivatives(video)).toMatchObject({
			kind: 'video',
			video: { key: '720p' },
			poster: { key: 'PosterFrame' }
		});
	});

	it('waits on a video Apple is still processing', () => {
		const processing: AlbumItem = {
			...video,
			derivatives: video.derivatives.map((d) => (d.key === '720p' ? d : { ...d, state: 'pending' }))
		};
		expect(pickDerivatives(processing)).toBeNull();
	});
});

describe('parseAssetUrls', () => {
	const answer = (host: string, scheme = 'https') => ({
		items: {
			aa02: {
				url_location: host,
				url_path: '/S/abc/IMG_1.jpg?o=1&e=2',
				url_expiry: '2026-11-19T22:32:52Z'
			}
		},
		locations: { [host]: { scheme, hosts: [host] } }
	});

	it('builds each URL on its location', () => {
		const urls = parseAssetUrls(answer('cvws.icloud-content.com'));
		expect(urls.get('aa02')).toEqual({
			url: 'https://cvws.icloud-content.com/S/abc/IMG_1.jpg?o=1&e=2',
			expiresAt: new Date('2026-11-19T22:32:52Z')
		});
	});

	it('refuses a download from anywhere but Apple, or without TLS', () => {
		expect(() => parseAssetUrls(answer('evil.example'))).toThrow(/unexpected host/);
		expect(() => parseAssetUrls(answer('icloud-content.com.evil.example'))).toThrow(
			/unexpected host/
		);
		expect(() => parseAssetUrls(answer('cvws.icloud-content.com', 'http'))).toThrow(
			/unexpected host/
		);
	});
});

/** A fetch that answers from `routes` by URL prefix, recording every call. */
function fakeFetch(routes: [prefix: string, answer: () => Response][]) {
	const calls: { url: string; body: unknown }[] = [];
	const fetcher: Fetch = async (input, init) => {
		const url = String(input);
		calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
		const route = routes.find(([prefix]) => url.startsWith(prefix));
		if (!route) throw new Error(`unexpected fetch ${url}`);
		return route[1]();
	};
	return { fetcher, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});

describe('SharedAlbumClient', () => {
	it("follows the redirect to the album's partition, and stays there", async () => {
		const { fetcher, calls } = fakeFetch([
			[
				'https://p23-sharedstreams.icloud.com/',
				() => json({ 'X-Apple-MMe-Host': 'p149-sharedstreams.icloud.com' }, 330)
			],
			['https://p149-sharedstreams.icloud.com/', () => json(stream())]
		]);
		const client = new SharedAlbumClient(TOKEN, fetcher);
		expect((await client.album()).items).toHaveLength(2);
		await client.album();
		expect(calls.map((c) => new URL(c.url).host)).toEqual([
			'p23-sharedstreams.icloud.com',
			'p149-sharedstreams.icloud.com',
			'p149-sharedstreams.icloud.com'
		]);
		expect(calls[0]).toMatchObject({
			url: `https://p23-sharedstreams.icloud.com/${TOKEN}/sharedstreams/webstream`,
			body: { streamCtag: null }
		});
	});

	it('never follows a redirect off Apple’s sharedstreams hosts', async () => {
		const { fetcher, calls } = fakeFetch([
			[
				'https://p23-sharedstreams.icloud.com/',
				() => json({ 'X-Apple-MMe-Host': 'evil.example' }, 330)
			]
		]);
		await expect(new SharedAlbumClient(TOKEN, fetcher).album()).rejects.toThrow(/unexpected host/);
		expect(calls).toHaveLength(1);
	});

	it('says plainly when there is no such public album', async () => {
		const { fetcher } = fakeFetch([['https://p23', () => new Response('', { status: 404 })]]);
		await expect(new SharedAlbumClient(TOKEN, fetcher).album()).rejects.toThrow(/Public Website/);
	});

	it('asks for download URLs in batches the website uses', async () => {
		const guids = Array.from({ length: 30 }, (_, i) => `G${i}`);
		const { fetcher, calls } = fakeFetch([
			['https://p23', () => json({ items: {}, locations: {} })]
		]);
		await new SharedAlbumClient(TOKEN, fetcher).assetUrls(guids);
		expect(calls.map((c) => (c.body as { photoGuids: string[] }).photoGuids.length)).toEqual([
			25, 5
		]);
	});

	describe('download', () => {
		const derivative = {
			key: '2049',
			checksum: 'aa02',
			bytes: 4,
			width: 1,
			height: 1,
			state: null
		};
		const asset = { url: 'https://cvws.icloud-content.com/S/a.jpg', expiresAt: null };
		const answering = (res: () => Response) =>
			new SharedAlbumClient(TOKEN, fakeFetch([['https://cvws', res]]).fetcher);

		it('returns exactly the bytes Apple listed', async () => {
			const bytes = await answering(() => new Response(new Uint8Array([1, 2, 3, 4]))).download(
				asset,
				derivative
			);
			expect(Array.from(bytes as Uint8Array)).toEqual([1, 2, 3, 4]);
		});

		it('refuses a file of any other size', async () => {
			const short = answering(() => new Response(new Uint8Array([1, 2, 3])));
			await expect(short.download(asset, derivative)).rejects.toThrow(/3 bytes for a 4-byte/);
			const long = answering(() => new Response(new Uint8Array(5)));
			await expect(long.download(asset, derivative)).rejects.toThrow(/more than/);
		});

		it('reports a lapsed URL so the caller can ask again', async () => {
			const lapsed = answering(() => new Response('', { status: 403 }));
			expect(await lapsed.download(asset, derivative)).toBe('expired');
		});
	});
});
