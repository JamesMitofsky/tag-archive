import { z } from 'zod';
import { readCapped } from '../streams';

/**
 * A client for an iCloud Shared Album's public website: the two endpoints the
 * page at icloud.com/sharedalbum/#<token> calls. Apple publishes no API for
 * Shared Albums; these are the website's own private endpoints, so they can
 * change without notice. Everything they answer is checked against a schema
 * here, so a change fails loudly with what moved rather than importing
 * garbage.
 *
 *   POST https://<host>/<token>/sharedstreams/webstream     { streamCtag: null }
 *     → the album's name and every item in it, with each item's derivatives
 *       (the sizes Apple keeps: a thumbnail and a ≤2048px-ish JPEG for a
 *       photograph; a poster frame, 360p and 720p for a video).
 *   POST https://<host>/<token>/sharedstreams/webasseturls  { photoGuids: [...] }
 *     → a signed download URL per derivative, keyed by its checksum. The URLs
 *       lapse after about 20 minutes, so they are asked for just before use.
 *
 * An album lives on one of Apple's partitions (`p<N>-sharedstreams`). Any
 * partition answers 330 naming the right one, so this starts anywhere and
 * follows that answer — but only to another `p<N>-sharedstreams.icloud.com`
 * host, since the token travels in the path.
 *
 * The token is the whole of the album's access control: anyone holding the
 * link can read the album. Keep it out of the repository and out of logs.
 */

/** Any partition works as a start; the first answer names the album's own. */
const START_HOST = 'p23-sharedstreams.icloud.com';
const SHAREDSTREAMS_HOST_RE = /^p\d{1,4}-sharedstreams\.icloud\.com$/;
/** Where Apple serves an album's files from. */
const CONTENT_HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.icloud-content\.com$/;
/** Apple's tokens are base62-ish with `-` and `_`; short legacy ones are 15 characters. */
const TOKEN_RE = /^[A-Za-z0-9_-]{10,512}$/;
/** How many items one webasseturls call asks about, as the website batches them. */
export const ASSET_URL_BATCH = 25;

/** The token in a shared album's link (`…/sharedalbum/#<token>` or `#<token>;<photo>`), or the bare token. */
export function parseAlbumToken(input: string): string | null {
	const text = input.trim();
	if (TOKEN_RE.test(text)) return text;

	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:') return null;
	if (url.hostname !== 'www.icloud.com' && url.hostname !== 'icloud.com') return null;
	if (!url.pathname.startsWith('/sharedalbum/')) return null;
	// The fragment is `<token>`, or `<token>;<photo guid>` when the link opens one photo.
	const token = url.hash.slice(1).split(';')[0];
	return TOKEN_RE.test(token) ? token : null;
}

const count = z
	.string()
	.regex(/^\d{1,12}$/)
	.transform(Number);
const guid = z.string().regex(/^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/);

const derivativeSchema = z.object({
	fileSize: count,
	checksum: z.string().regex(/^[0-9a-f]{2,128}$/),
	width: count,
	height: count,
	// Absent on a photograph's derivatives; `available` on a video's once transcoded.
	state: z.string().optional()
});

const itemSchema = z.object({
	photoGuid: guid,
	batchGuid: guid,
	// Absent for photographs.
	mediaAssetType: z.string().optional(),
	dateCreated: z.iso.datetime(),
	batchDateCreated: z.iso.datetime(),
	caption: z.string().optional(),
	contributorFullName: z.string().optional(),
	derivatives: z.record(z.string(), derivativeSchema)
});

const streamSchema = z.object({
	streamName: z.string(),
	photos: z.array(itemSchema)
});

const assetUrlsSchema = z.object({
	items: z.record(
		z.string(),
		z.object({
			url_location: z.string(),
			url_path: z.string().startsWith('/'),
			url_expiry: z.iso.datetime().optional()
		})
	),
	locations: z
		.record(z.string(), z.object({ scheme: z.string(), hosts: z.array(z.string()).min(1) }))
		.optional()
});

/** One stored size of an item. `key` is Apple's name for it: a pixel size (`2049`), `720p`, `PosterFrame`. */
export type Derivative = {
	key: string;
	checksum: string;
	bytes: number;
	width: number;
	height: number;
	/** Null when Apple gives no state (photographs); a video's is `available` once ready. */
	state: string | null;
};

export type AlbumItem = {
	/** Apple's photoGuid, uppercase. */
	guid: string;
	kind: 'photo' | 'video';
	/** The upload it arrived in: everything one person posted at once. */
	batchGuid: string;
	/** When it was added (ISO 8601 UTC). */
	postedAt: string;
	batchPostedAt: string;
	contributor: string | null;
	caption: string | null;
	derivatives: Derivative[];
};

export type Album = { name: string; items: AlbumItem[] };

/** A signed URL for one derivative, valid until `expiresAt` (null when Apple didn't say). */
export type AssetUrl = { url: string; expiresAt: Date | null };

/** Apple's answer didn't have the shape this client was written against. */
export class AlbumFormatError extends Error {
	constructor(what: string, issues: z.core.$ZodIssue[]) {
		const detail = issues
			.slice(0, 5)
			.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
			.join('; ');
		super(`iCloud's ${what} answer changed shape (${detail})`);
		this.name = 'AlbumFormatError';
	}
}

const text = (value: string | undefined) => value?.trim() || null;

function toItem(raw: z.infer<typeof itemSchema>): AlbumItem {
	return {
		guid: raw.photoGuid.toUpperCase(),
		kind: raw.mediaAssetType === 'video' ? 'video' : 'photo',
		batchGuid: raw.batchGuid.toUpperCase(),
		postedAt: raw.dateCreated,
		batchPostedAt: raw.batchDateCreated,
		contributor: text(raw.contributorFullName),
		caption: text(raw.caption),
		derivatives: Object.entries(raw.derivatives).map(([key, d]) => ({
			key,
			checksum: d.checksum,
			bytes: d.fileSize,
			width: d.width,
			height: d.height,
			state: d.state ?? null
		}))
	};
}

/** Parse a webstream answer. Exported for tests. */
export function parseStream(body: unknown): Album {
	const parsed = streamSchema.safeParse(body);
	if (!parsed.success) throw new AlbumFormatError('album', parsed.error.issues);
	return { name: parsed.data.streamName, items: parsed.data.photos.map(toItem) };
}

/** Parse a webasseturls answer into URLs by derivative checksum. Exported for tests. */
export function parseAssetUrls(body: unknown): Map<string, AssetUrl> {
	const parsed = assetUrlsSchema.safeParse(body);
	if (!parsed.success) throw new AlbumFormatError('download URL', parsed.error.issues);
	const urls = new Map<string, AssetUrl>();
	for (const [checksum, item] of Object.entries(parsed.data.items)) {
		const location = parsed.data.locations?.[item.url_location];
		const scheme = location?.scheme ?? 'https';
		const host = location?.hosts[0] ?? item.url_location;
		// The URL is fetched next, so it must point where Apple keeps files, over TLS.
		if (scheme !== 'https' || !CONTENT_HOST_RE.test(host)) {
			throw new Error(`iCloud offered a download from an unexpected host: ${scheme}://${host}`);
		}
		urls.set(checksum, {
			url: `https://${host}${item.url_path}`,
			expiresAt: item.url_expiry ? new Date(item.url_expiry) : null
		});
	}
	return urls;
}

const area = (d: Derivative) => d.width * d.height;
const largest = (ds: Derivative[]) =>
	ds.reduce<Derivative | null>(
		(best, d) => (best === null || area(d) > area(best) ? d : best),
		null
	);

/**
 * What to copy of an item: a photograph's largest size; a video's largest
 * rendition and its poster frame. Null when Apple has nothing ready yet (a
 * video still transcoding), for a later run to pick up.
 */
export function pickDerivatives(
	item: AlbumItem
):
	| { kind: 'photo'; photo: Derivative }
	| { kind: 'video'; video: Derivative; poster: Derivative }
	| null {
	const ready = item.derivatives.filter((d) => d.state === null || d.state === 'available');
	if (item.kind === 'photo') {
		const photo = largest(ready.filter((d) => d.key !== 'PosterFrame'));
		return photo ? { kind: 'photo', photo } : null;
	}
	const poster = ready.find((d) => d.key === 'PosterFrame');
	const video = largest(ready.filter((d) => d.key !== 'PosterFrame'));
	return poster && video ? { kind: 'video', video, poster } : null;
}

export type Fetch = typeof fetch;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a request on network errors and 5xx/429 answers, with backoff.
 * Anything else — including a 4xx — is the caller's to judge.
 */
async function withRetries(attempt: () => Promise<Response>, tries = 4): Promise<Response> {
	for (let i = 1; ; i++) {
		try {
			const res = await attempt();
			if ((res.status < 500 && res.status !== 429) || i === tries) return res;
			await res.body?.cancel().catch(() => {});
		} catch (e) {
			if (i === tries) throw e;
		}
		await sleep(500 * 2 ** i);
	}
}

/** One shared album, reached through its token. */
export class SharedAlbumClient {
	private host = START_HOST;

	constructor(
		private readonly token: string,
		private readonly fetcher: Fetch = fetch
	) {
		if (!TOKEN_RE.test(token)) throw new Error('Not a shared album token');
	}

	/** POST to one of the album's endpoints, following its partition redirect. */
	private async post(endpoint: 'webstream' | 'webasseturls', body: unknown): Promise<unknown> {
		for (let hops = 0; hops < 3; hops++) {
			const url = `https://${this.host}/${this.token}/sharedstreams/${endpoint}`;
			const res = await withRetries(() =>
				this.fetcher(url, {
					method: 'POST',
					// What the website sends: a JSON body as text/plain, from its own origin.
					headers: { 'content-type': 'text/plain', origin: 'https://www.icloud.com' },
					body: JSON.stringify(body)
				})
			);
			if (res.status === 330) {
				const answer = (await res.json().catch(() => null)) as Record<string, unknown> | null;
				const next = answer?.['X-Apple-MMe-Host'] ?? res.headers.get('x-apple-mme-host');
				if (typeof next !== 'string' || !SHAREDSTREAMS_HOST_RE.test(next)) {
					throw new Error(`iCloud redirected the album to an unexpected host: ${String(next)}`);
				}
				this.host = next;
				continue;
			}
			if (res.status === 404) {
				await res.body?.cancel().catch(() => {});
				throw new Error(
					'iCloud has no such album: check the link, and that the album is shared as a Public Website'
				);
			}
			if (!res.ok) {
				const detail = (await res.text().catch(() => '')).slice(0, 200);
				throw new Error(`iCloud ${endpoint} answered ${res.status}: ${detail}`);
			}
			return res.json();
		}
		throw new Error('iCloud redirected the album too many times');
	}

	/** The album's name and every item in it. */
	async album(): Promise<Album> {
		return parseStream(await this.post('webstream', { streamCtag: null }));
	}

	/** Signed download URLs for every derivative of `guids`, by derivative checksum. */
	async assetUrls(guids: string[]): Promise<Map<string, AssetUrl>> {
		const urls = new Map<string, AssetUrl>();
		for (let i = 0; i < guids.length; i += ASSET_URL_BATCH) {
			const batch = guids.slice(i, i + ASSET_URL_BATCH);
			for (const [checksum, url] of parseAssetUrls(
				await this.post('webasseturls', { photoGuids: batch })
			)) {
				urls.set(checksum, url);
			}
		}
		return urls;
	}

	/**
	 * Download one derivative, refusing anything but exactly the size Apple
	 * listed for it (the closest thing to an integrity check its answers
	 * allow: its checksums aren't a digest of the bytes). A URL that lapsed
	 * answers 403 / 410: the caller asks for fresh URLs and tries again.
	 */
	async download(asset: AssetUrl, derivative: Derivative): Promise<Uint8Array | 'expired'> {
		const res = await withRetries(() => this.fetcher(asset.url));
		if (res.status === 403 || res.status === 410) {
			await res.body?.cancel().catch(() => {});
			return 'expired';
		}
		if (res.status !== 200) {
			await res.body?.cancel().catch(() => {});
			throw new Error(`iCloud download answered ${res.status}`);
		}
		const bytes = await readCapped(res, derivative.bytes);
		if (!bytes || bytes.length !== derivative.bytes) {
			throw new Error(
				`iCloud sent ${bytes ? bytes.length : 'more than'} bytes for a ${derivative.bytes}-byte file`
			);
		}
		return bytes;
	}
}
