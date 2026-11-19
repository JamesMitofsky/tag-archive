import { MAX_IMAGES_PER_SET } from '$lib/validation/imageSet';
import { pickDerivatives, type AlbumItem } from './sharedAlbum';

/**
 * What a sync of a shared album would do, worked out from the album and the
 * guids already copied (`icloud_asset`), before anything is downloaded. Pure,
 * so a dry run and the real run see the same plan.
 *
 * Photographs become image sets, one per album upload ("batch": what one
 * person posted at once, usually one outing), since a set is "photographs
 * uploaded together". A batch larger than a set may hold is split into
 * near-equal parts (168 → 42 + 42 + 42 + 42), never a full set and a stub.
 * Oldest batch first; within a set, photographs in Apple's `dateCreated`
 * order (the photograph's own time, where the album checked had it). The
 * set's date still comes from each photograph's EXIF, as for any upload.
 */

export type PlannedSet = {
	batchGuid: string;
	/** Which part of its batch this is, from 1, and how many parts it was split into. */
	part: number;
	parts: number;
	contributor: string | null;
	photos: AlbumItem[];
};

export type SyncPlan = {
	sets: PlannedSet[];
	videos: AlbumItem[];
	/** Items copied by an earlier run (or deleted from the archive since): left alone. */
	alreadyCopied: number;
	/** Items Apple has no file for yet (a video still processing): a later run gets them. */
	notReady: AlbumItem[];
	/** Videos left out because the run was told to skip them. */
	videosSkipped: number;
	/** Copied items the album no longer holds. The archive keeps its copies. */
	goneFromAlbum: number;
};

/** Split `items` into the fewest parts of at most `max`, as equal in size as can be. */
export function splitEvenly<T>(items: T[], max: number): T[][] {
	if (items.length === 0) return [];
	const parts = Math.ceil(items.length / max);
	const base = Math.floor(items.length / parts);
	const larger = items.length % parts;
	const out: T[][] = [];
	let at = 0;
	for (let i = 0; i < parts; i++) {
		const size = base + (i < larger ? 1 : 0);
		out.push(items.slice(at, at + size));
		at += size;
	}
	return out;
}

const byPosted = (a: AlbumItem, b: AlbumItem) =>
	a.postedAt.localeCompare(b.postedAt) || a.guid.localeCompare(b.guid);

export function planSync(
	items: AlbumItem[],
	copied: ReadonlySet<string>,
	options: { videos: boolean; maxPerSet?: number }
): SyncPlan {
	const maxPerSet = options.maxPerSet ?? MAX_IMAGES_PER_SET;
	const inAlbum = new Set(items.map((item) => item.guid));
	const goneFromAlbum = [...copied].filter((guid) => !inAlbum.has(guid)).length;

	let alreadyCopied = 0;
	let videosSkipped = 0;
	const notReady: AlbumItem[] = [];
	const videos: AlbumItem[] = [];
	const batches = new Map<string, AlbumItem[]>();

	for (const item of items) {
		if (copied.has(item.guid)) {
			alreadyCopied++;
			continue;
		}
		if (item.kind === 'video' && !options.videos) {
			videosSkipped++;
			continue;
		}
		if (!pickDerivatives(item)) {
			notReady.push(item);
			continue;
		}
		if (item.kind === 'video') {
			videos.push(item);
			continue;
		}
		const batch = batches.get(item.batchGuid);
		if (batch) batch.push(item);
		else batches.set(item.batchGuid, [item]);
	}

	const ordered = [...batches.values()]
		.map((photos) => photos.sort(byPosted))
		.sort(
			(a, b) =>
				a[0].batchPostedAt.localeCompare(b[0].batchPostedAt) ||
				a[0].batchGuid.localeCompare(b[0].batchGuid)
		);

	const sets: PlannedSet[] = [];
	for (const photos of ordered) {
		const parts = splitEvenly(photos, maxPerSet);
		parts.forEach((part, i) =>
			sets.push({
				batchGuid: photos[0].batchGuid,
				part: i + 1,
				parts: parts.length,
				contributor: photos[0].contributor,
				photos: part
			})
		);
	}

	return {
		sets,
		videos: videos.sort(byPosted),
		alreadyCopied,
		notReady,
		videosSkipped,
		goneFromAlbum
	};
}
