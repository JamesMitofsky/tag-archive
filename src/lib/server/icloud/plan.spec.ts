import { describe, expect, it } from 'vitest';
import { planSync, splitEvenly } from './plan';
import type { AlbumItem, Derivative } from './sharedAlbum';

const PHOTO_FILE: Derivative = {
	key: '2049',
	checksum: 'aa',
	bytes: 1000,
	width: 1639,
	height: 2049,
	state: null
};
const VIDEO_FILES: Derivative[] = [
	{ key: 'PosterFrame', checksum: 'p', bytes: 10, width: 1280, height: 720, state: 'available' },
	{ key: '720p', checksum: 'v', bytes: 5000, width: 1280, height: 720, state: 'available' }
];

let n = 0;
function item(batch: string, overrides: Partial<AlbumItem> = {}): AlbumItem {
	n++;
	return {
		guid: `G${String(n).padStart(4, '0')}`,
		kind: 'photo',
		batchGuid: batch,
		postedAt: `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
		batchPostedAt: `2026-01-0${batch.slice(-1)}T00:00:00Z`,
		contributor: `poster of ${batch}`,
		caption: null,
		derivatives: [PHOTO_FILE],
		...overrides
	};
}

describe('splitEvenly', () => {
	it('splits into the fewest near-equal parts', () => {
		const sizes = (count: number, max: number) =>
			splitEvenly(
				Array.from({ length: count }, (_, i) => i),
				max
			).map((part) => part.length);
		expect(sizes(168, 50)).toEqual([42, 42, 42, 42]);
		expect(sizes(51, 50)).toEqual([26, 25]);
		expect(sizes(50, 50)).toEqual([50]);
		expect(sizes(3, 50)).toEqual([3]);
		expect(sizes(0, 50)).toEqual([]);
	});

	it('keeps every item, in order', () => {
		const items = Array.from({ length: 101 }, (_, i) => i);
		expect(splitEvenly(items, 50).flat()).toEqual(items);
	});
});

describe('planSync', () => {
	it('makes one set per album upload, oldest upload first', () => {
		const later = [item('batch-2'), item('batch-2')];
		const earlier = [item('batch-1')];
		const plan = planSync([...later, ...earlier], new Set(), { videos: true });
		expect(plan.sets.map((set) => [set.batchGuid, set.photos.length])).toEqual([
			['batch-1', 1],
			['batch-2', 2]
		]);
		expect(plan.sets[0]).toMatchObject({ part: 1, parts: 1, contributor: 'poster of batch-1' });
	});

	it('orders photographs within a set by their time', () => {
		const first = item('batch-1', { postedAt: '2026-01-01T08:00:00Z' });
		const second = item('batch-1', { postedAt: '2026-01-01T09:00:00Z' });
		const plan = planSync([second, first], new Set(), { videos: true });
		expect(plan.sets[0].photos.map((p) => p.guid)).toEqual([first.guid, second.guid]);
	});

	it('splits an upload too large for one set into numbered parts', () => {
		const big = Array.from({ length: 7 }, () => item('batch-1'));
		const plan = planSync(big, new Set(), { videos: true, maxPerSet: 3 });
		expect(plan.sets.map((set) => [set.part, set.parts, set.photos.length])).toEqual([
			[1, 3, 3],
			[2, 3, 2],
			[3, 3, 2]
		]);
	});

	it('leaves alone what an earlier run copied, and counts what left the album', () => {
		const copied = item('batch-1');
		const fresh = item('batch-1');
		const plan = planSync([copied, fresh], new Set([copied.guid, 'G-deleted-from-album']), {
			videos: true
		});
		expect(plan.alreadyCopied).toBe(1);
		expect(plan.goneFromAlbum).toBe(1);
		expect(plan.sets.flatMap((set) => set.photos.map((p) => p.guid))).toEqual([fresh.guid]);
	});

	it('keeps videos out of sets, and leaves them out entirely when told to', () => {
		const video = item('batch-1', { kind: 'video', derivatives: VIDEO_FILES });
		const photo = item('batch-1');
		const withVideos = planSync([video, photo], new Set(), { videos: true });
		expect(withVideos.videos.map((v) => v.guid)).toEqual([video.guid]);
		expect(withVideos.sets[0].photos.map((p) => p.guid)).toEqual([photo.guid]);

		const without = planSync([video, photo], new Set(), { videos: false });
		expect(without.videos).toEqual([]);
		expect(without.videosSkipped).toBe(1);
	});

	it('holds back an item Apple has no file for yet', () => {
		const processing = item('batch-1', {
			kind: 'video',
			derivatives: VIDEO_FILES.map((d) => ({ ...d, state: 'pending' }))
		});
		const plan = planSync([processing], new Set(), { videos: true });
		expect(plan.notReady.map((i) => i.guid)).toEqual([processing.guid]);
		expect(plan.videos).toEqual([]);
	});
});
