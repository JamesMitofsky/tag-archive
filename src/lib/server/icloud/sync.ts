/**
 * Copy an iCloud Shared Album into the archive: `pnpm images:icloud`
 * (scripts/icloud-sync.mjs boots Vite and calls `main` here, since the upload
 * code needs SvelteKit's `$env` and `$lib`). A dry run by default.
 *
 *   pnpm images:icloud --album '<link>'                     # plan only
 *   pnpm images:icloud --album '<link>' --apply --as you@example.com --limit 3
 *
 * Photographs land as image sets exactly as an upload does: the largest file
 * Apple keeps becomes the original, a WebP display copy is made here (see
 * ./displayCopy), and the app's own `finalizeImage` reads both back, checks
 * them and parses the EXIF; `createImageSet` then attaches them and dates the
 * set. One set per album upload (see ./plan). By default the sets wait in the
 * review queue (/keeper/settings/review/images); --publish lands them vetted.
 * Videos are copied into the bucket under `videos/` and recorded in
 * `icloud_asset`; the archive has no page for them yet.
 *
 * Re-runnable. Each item gets an `icloud_asset` row once it is safely in, and
 * a later run skips every item with a row — including a photograph a keeper
 * has since deleted or rejected, which stays deleted. A photograph's bucket
 * keys are derived from Apple's guid for it, so a run cut short part-way
 * through a set picks up the same image rows next time instead of uploading
 * twice; and a set is only made once every photograph in it has copied, so a
 * failure never leaves half a batch published.
 *
 * Options:
 *   --album <link>   the album's public link (or set ICLOUD_ALBUM_URL)
 *   --apply          write; without it nothing is downloaded or written
 *   --as <email>     the keeper the photographs and sets are attributed to (needed with --apply)
 *   --publish        skip the review queue: needs an admin, and VERCEL_TOKEN for a live database
 *   --limit <n>      copy at most n sets and n videos this run
 *   --no-videos      leave the album's videos out
 *
 * Against the live archive, export the production DATABASE_URL,
 * DATABASE_AUTH_TOKEN, BETTER_AUTH_SECRET and R2_* first (they win over
 * .env), and IMPORT_CONFIRM=1. It refuses a remote database with the local
 * store, or the reverse: the rows would point at files the site can't reach.
 */
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { IMAGE_TYPES, sniffImageType, type ImageType } from '$lib/imageType';
import type { Actor } from '../artefacts';
import { db } from '../db';
import { icloudAsset, image, user, type NewIcloudAsset } from '../db/schema';
import { purgeArchiveCache, vercelProject } from '../events-import/purge';
import { imageKeys, parseImageKeys } from '../imageKeys';
import { createImageSet } from '../imageSets';
import { finalizeImage, isFinalized, type UploadOwner } from '../imageUploads';
import { isLocalStore, putObject, urlForKey } from '../scans';
import { displayCopy } from './displayCopy';
import { sniffVideoType } from './videoType';
import { planSync, type PlannedSet, type SyncPlan } from './plan';
import {
	SharedAlbumClient,
	parseAlbumToken,
	pickDerivatives,
	type AlbumItem,
	type AssetUrl,
	type Derivative
} from './sharedAlbum';

/** Photographs downloaded and encoded at once: enough to overlap the network, few enough for memory. */
const CONCURRENCY = 4;

type Options = {
	token: string;
	apply: boolean;
	publish: boolean;
	as: string | undefined;
	limit: number;
	videos: boolean;
};

function readOptions(argv: string[]): Options {
	const { values } = parseArgs({
		args: argv,
		options: {
			album: { type: 'string' },
			apply: { type: 'boolean', default: false },
			publish: { type: 'boolean', default: false },
			as: { type: 'string' },
			limit: { type: 'string' },
			'no-videos': { type: 'boolean', default: false }
		},
		strict: true
	});
	const link = values.album ?? env.ICLOUD_ALBUM_URL;
	if (!link) throw new Error('Pass the album link with --album, or set ICLOUD_ALBUM_URL.');
	const token = parseAlbumToken(link);
	if (!token) {
		throw new Error('That is not a shared album link (https://www.icloud.com/sharedalbum/#…).');
	}
	let limit = Infinity;
	if (values.limit !== undefined) {
		limit = Number(values.limit);
		if (!Number.isSafeInteger(limit) || limit < 1)
			throw new Error('--limit takes a whole number ≥ 1');
	}
	if (values.apply && !values.as) {
		throw new Error('--apply needs --as <email>: the keeper the photographs are attributed to.');
	}
	return {
		token,
		apply: values.apply,
		publish: values.publish,
		as: values.as,
		limit,
		videos: !values['no-videos']
	};
}

const isRemoteDatabase = () => /^(libsql|https):\/\//.test(env.DATABASE_URL ?? '');

/** Refuse a run that would write where it shouldn't, before anything is fetched. */
function checkTargets(options: Options): void {
	const remote = isRemoteDatabase();
	if (remote === isLocalStore()) {
		throw new Error(
			remote
				? 'DATABASE_URL is the live database but S3_ENDPOINT points at a local store: ' +
						'the rows would name files the site cannot reach. Unset S3_ENDPOINT and export the R2_* settings.'
				: 'DATABASE_URL is local but storage is the live R2 bucket (S3_ENDPOINT unset). ' +
						'Start the local store (pnpm dev:local), or point DATABASE_URL at the live database.'
		);
	}
	if (!options.apply) return;
	if (remote && env.IMPORT_CONFIRM !== '1') {
		throw new Error(
			`Refusing to write to the live database without IMPORT_CONFIRM=1. ` +
				`Dry-run first (drop --apply), then re-run with IMPORT_CONFIRM=1.`
		);
	}
	if (remote && options.publish) {
		if (!env.VERCEL_TOKEN) {
			throw new Error(
				'--publish against the live database needs VERCEL_TOKEN to refresh the site cache.'
			);
		}
		vercelProject();
	}
}

/** The keeper `--as` names, as the actor and upload owner every write is made by. */
async function resolveKeeper(
	email: string,
	publish: boolean
): Promise<{ actor: Actor; owner: UploadOwner }> {
	const row = await db
		.select({ id: user.id, role: user.role })
		.from(user)
		.where(eq(user.email, email))
		.get();
	if (!row) throw new Error(`No keeper with email ${email}`);
	if (publish && row.role !== 'admin') {
		throw new Error(`--publish needs an admin; ${email} is ${row.role ?? 'not an admin'}.`);
	}
	return {
		// Without --publish, the sets wait for review as a contributor's would.
		actor: { userId: row.id, role: publish ? 'admin' : null },
		owner: { kind: 'keeper', userId: row.id }
	};
}

const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const gigabytes = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;

function downloadBytes(items: AlbumItem[]): number {
	let total = 0;
	for (const item of items) {
		const picked = pickDerivatives(item);
		if (picked?.kind === 'photo') total += picked.photo.bytes;
		if (picked?.kind === 'video') total += picked.video.bytes + picked.poster.bytes;
	}
	return total;
}

function printPlan(albumName: string, itemCount: number, plan: SyncPlan, options: Options): void {
	const photos = plan.sets.flatMap((set) => set.photos);
	const batches = new Set(plan.sets.map((set) => set.batchGuid)).size;
	console.log(`Album “${albumName}”: ${itemCount} items.`);
	console.log(`  already copied:  ${plan.alreadyCopied}`);
	console.log(
		`  to copy:         ${photos.length} photographs in ${plan.sets.length} sets ` +
			`(${batches} album uploads), ${gigabytes(downloadBytes(photos))}`
	);
	console.log(
		`                   ${plan.videos.length} videos, ${gigabytes(downloadBytes(plan.videos))}` +
			(plan.videosSkipped ? ` (${plan.videosSkipped} left out by --no-videos)` : '')
	);
	if (plan.notReady.length)
		console.log(`  not ready yet:   ${plan.notReady.length} (a later run copies them)`);
	if (plan.goneFromAlbum) {
		console.log(`  gone from album: ${plan.goneFromAlbum} copied items (the archive keeps them)`);
	}
	if (Number.isFinite(options.limit)) {
		console.log(
			`  this run:        at most ${options.limit} sets and ${options.limit} videos (--limit)`
		);
	}
	console.log(
		options.publish
			? '  sets land published (--publish).'
			: '  sets land in the review queue (/keeper/settings/review/images).'
	);
}

/** Run `task` over `items`, at most `limit` at a time, keeping order; never rejects. */
async function settleAll<T, R>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			try {
				results[i] = { status: 'fulfilled', value: await task(items[i]) };
			} catch (reason) {
				results[i] = { status: 'rejected', reason };
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The file name Apple serves a derivative under (`IMG_2331.mp4`, `<uuid>.jpg`), for `original_name`. */
function fileName(asset: AssetUrl): string | null {
	const last = new URL(asset.url).pathname.split('/').pop() ?? '';
	try {
		return decodeURIComponent(last) || null;
	} catch {
		return null;
	}
}

class Copier {
	constructor(
		private readonly client: SharedAlbumClient,
		private readonly albumName: string,
		private readonly actor: Actor,
		private readonly owner: UploadOwner
	) {}

	/**
	 * Download one derivative, asking for a fresh URL once if the one in hand
	 * lapsed (they last about 20 minutes; a long set can outrun them).
	 */
	private async fetchDerivative(
		item: AlbumItem,
		derivative: Derivative,
		urls: Map<string, AssetUrl>
	): Promise<{ bytes: Uint8Array; asset: AssetUrl }> {
		for (let fresh = false; ; fresh = true) {
			let asset = fresh ? undefined : urls.get(derivative.checksum);
			if (!asset) {
				for (const [checksum, url] of await this.client.assetUrls([item.guid])) {
					urls.set(checksum, url);
				}
				asset = urls.get(derivative.checksum);
			}
			if (!asset) throw new Error(`iCloud gave no download URL for ${item.guid}`);
			const bytes = await this.client.download(asset, derivative);
			if (bytes !== 'expired') return { bytes, asset };
			if (fresh) throw new Error(`iCloud refused a fresh download URL for ${item.guid}`);
		}
	}

	/**
	 * One photograph, uploaded and finalized like any upload; its image row's
	 * id, and the set it already sits in (a previous run that stopped between
	 * making the set and recording it).
	 */
	private async copyPhoto(
		item: AlbumItem,
		urls: Map<string, AssetUrl>
	): Promise<{ item: AlbumItem; imageId: number; setId: number | null }> {
		const picked = pickDerivatives(item);
		if (picked?.kind !== 'photo') throw new Error(`${item.guid} has no photograph to copy`);

		// The guid is a uuid, so it can name the folder: the same keys every run.
		const folder = item.guid.toLowerCase();
		const existing = await this.existingUpload(folder);
		if (existing) {
			const image = await finalizeImage({ ...existing, name: '' }, this.owner);
			return { item, imageId: image.id, setId: await this.setOf(image.id) };
		}

		const { bytes, asset } = await this.fetchDerivative(item, picked.photo, urls);
		const type = sniffImageType(bytes);
		if (!type) throw new Error(`${item.guid} is not a JPEG, PNG, WebP, GIF or HEIC file`);
		const keys = imageKeys('', type, folder);
		if (!parseImageKeys(keys)) throw new Error(`${item.guid} can't name a bucket folder`);

		const display = await displayCopy(bytes);
		await putObject(keys.originalKey, bytes, type);
		await putObject(keys.displayKey, display, 'image/webp');
		const image = await finalizeImage({ ...keys, name: fileName(asset) ?? '' }, this.owner);
		return { item, imageId: image.id, setId: await this.setOf(image.id) };
	}

	/** Keys a previous run already finalized under this folder, whichever type it stored. */
	private async existingUpload(folder: string) {
		for (const type of IMAGE_TYPES as readonly ImageType[]) {
			const keys = imageKeys('', type, folder);
			if (await isFinalized(keys.originalKey)) return keys;
		}
		return null;
	}

	private async setOf(imageId: number): Promise<number | null> {
		const row = await db
			.select({ setId: image.setId })
			.from(image)
			.where(eq(image.id, imageId))
			.get();
		return row?.setId ?? null;
	}

	private record(item: AlbumItem, fields: Partial<NewIcloudAsset>): NewIcloudAsset {
		return {
			guid: item.guid,
			kind: item.kind,
			album: this.albumName,
			batchGuid: item.batchGuid,
			contributor: item.contributor,
			caption: item.caption,
			postedAt: item.postedAt,
			createdBy: this.actor.userId,
			updatedBy: this.actor.userId,
			...fields
		};
	}

	/** Copy a planned set whole, or not at all; the new set's id (null when every photograph was already in one). */
	async copySet(set: PlannedSet): Promise<number | null> {
		const urls = await this.client.assetUrls(set.photos.map((photo) => photo.guid));
		const results = await settleAll(set.photos, CONCURRENCY, (photo) =>
			this.copyPhoto(photo, urls)
		);
		const failed = results.flatMap((r, i) =>
			r.status === 'rejected' ? [`${set.photos[i].guid}: ${message(r.reason)}`] : []
		);
		if (failed.length) {
			throw new Error(
				`${failed.length} of ${set.photos.length} photographs failed — ${failed.join('; ')}`
			);
		}
		const copied = results.map(
			(r) => (r as PromiseFulfilledResult<Awaited<ReturnType<Copier['copyPhoto']>>>).value
		);

		const loose = copied.filter((c) => c.setId === null);
		let setId: number | null = null;
		if (loose.length) {
			const created = await createImageSet(
				{
					description: '',
					event: '',
					imageIds: loose.map((c) => c.imageId),
					date: null,
					dateAuto: true
				},
				this.actor,
				this.owner
			);
			if (!created.ok) throw new Error(`The set was refused: ${created.message}`);
			setId = created.id;
		}

		await db
			.insert(icloudAsset)
			.values(copied.map((c) => this.record(c.item, { imageId: c.imageId })))
			.onConflictDoNothing({ target: icloudAsset.guid });
		return setId;
	}

	/** Copy one video and its poster frame into `videos/<guid>/`. */
	async copyVideo(item: AlbumItem): Promise<void> {
		const picked = pickDerivatives(item);
		if (picked?.kind !== 'video') throw new Error(`${item.guid} has no video to copy`);
		const urls = await this.client.assetUrls([item.guid]);
		const folder = `videos/${item.guid.toLowerCase()}`;

		const poster = await this.fetchDerivative(item, picked.poster, urls);
		const posterType = sniffImageType(poster.bytes);
		if (!posterType) throw new Error(`${item.guid}'s poster frame is not an image`);
		const video = await this.fetchDerivative(item, picked.video, urls);
		const videoType = sniffVideoType(video.bytes);
		if (!videoType) throw new Error(`${item.guid} is not an MP4 or QuickTime video`);

		const posterKey = `${folder}/poster.${posterType === 'image/jpeg' ? 'jpg' : posterType.slice(6)}`;
		const videoKey = `${folder}/video.${videoType === 'video/quicktime' ? 'mov' : 'mp4'}`;
		await putObject(posterKey, poster.bytes, posterType);
		await putObject(videoKey, video.bytes, videoType);
		await db
			.insert(icloudAsset)
			.values(this.record(item, { videoUrl: urlForKey(videoKey), posterUrl: urlForKey(posterKey) }))
			.onConflictDoNothing({ target: icloudAsset.guid });
	}
}

export async function main(argv: string[]): Promise<void> {
	const options = readOptions(argv);
	checkTargets(options);

	const client = new SharedAlbumClient(options.token);
	const album = await client.album();
	const copiedRows = await db.select({ guid: icloudAsset.guid }).from(icloudAsset);
	const plan = planSync(album.items, new Set(copiedRows.map((row) => row.guid)), {
		videos: options.videos
	});
	printPlan(album.name, album.items.length, plan, options);

	if (!options.apply) {
		console.log('\nDry run: nothing downloaded or written. Add --apply --as <email> to copy.');
		return;
	}

	const { actor, owner } = await resolveKeeper(options.as!, options.publish);
	const copier = new Copier(client, album.name, actor, owner);
	const sets = plan.sets.slice(0, options.limit);
	const videos = plan.videos.slice(0, options.limit);
	let failures = 0;
	let published = 0;

	for (const [i, set] of sets.entries()) {
		const label =
			`set ${i + 1}/${sets.length}: ${set.photos.length} photographs` +
			(set.parts > 1 ? ` (part ${set.part} of ${set.parts} of one upload)` : '');
		try {
			const setId = await copier.copySet(set);
			if (setId !== null && options.publish) published++;
			console.log(
				`  ${label} → ${setId === null ? 'already in the archive' : `image set ${setId}`}`
			);
		} catch (e) {
			failures++;
			console.error(`  ${label} failed, left for the next run: ${message(e)}`);
		}
	}

	for (const [i, video] of videos.entries()) {
		try {
			await copier.copyVideo(video);
			const picked = pickDerivatives(video);
			const size = picked?.kind === 'video' ? megabytes(picked.video.bytes) : '';
			console.log(
				`  video ${i + 1}/${videos.length} → videos/${video.guid.toLowerCase()}/ (${size})`
			);
		} catch (e) {
			failures++;
			console.error(
				`  video ${i + 1}/${videos.length} failed, left for the next run: ${message(e)}`
			);
		}
	}

	if (published && isRemoteDatabase()) {
		try {
			await purgeArchiveCache(env.VERCEL_TOKEN!);
			console.log('Purged the site cache; the new sets are live.');
		} catch (e) {
			console.error(
				`Copied, but purging the site cache failed (${message(e)}); it expires within a day.`
			);
			process.exitCode = 1;
		}
	}

	const left = plan.sets.length - sets.length + (plan.videos.length - videos.length);
	console.log(
		`\nDone: ${sets.length + videos.length - failures} copied, ${failures} failed` +
			(left ? `, ${left} left past --limit` : '') +
			'. Re-run any time: it only copies what is missing.'
	);
	if (failures) process.exitCode = 1;
}
