import { describe, expect, it } from 'vitest';
import {
	bloomScale,
	calmness,
	focusAmount,
	focusScale,
	groupBySeason,
	layoutField,
	nearestItem,
	offsetFrom,
	orderByCluster,
	parting,
	wrapDelta,
	type FieldItem
} from './field';
import { buildFieldItems } from './items';

const item = (
	id: string,
	cluster: string,
	date: string | null,
	kind: FieldItem['kind'] = 'photo'
): FieldItem => ({
	id,
	kind,
	src: kind === 'event' ? null : `https://bucket.test/${id}.webp`,
	aspect: 1.5,
	placeholder: null,
	title: id,
	date,
	cluster
});

const many = (n: number) =>
	Array.from({ length: n }, (_, i) =>
		item(`i${i}`, `c${Math.floor(i / 4)}`, `20${String(10 + (i % 15)).padStart(2, '0')}`)
	);

describe('wrapDelta', () => {
	it('takes the short way round the loop', () => {
		expect(wrapDelta(10, 100)).toBe(10);
		expect(wrapDelta(90, 100)).toBe(-10);
		expect(wrapDelta(-90, 100)).toBe(10);
		expect(wrapDelta(1010, 100)).toBeCloseTo(10);
	});

	it('stays within half the loop either way', () => {
		for (let d = -500; d <= 500; d += 7) {
			expect(Math.abs(wrapDelta(d, 120))).toBeLessThanOrEqual(60);
		}
	});
});

describe('orderByCluster', () => {
	it('dates a cluster by its finest date, not an earlier year-only one', () => {
		const ordered = orderByCluster([
			item('mid', 'b', '2019-03'),
			item('coarse', 'a', '2019'),
			item('fine', 'a', '2019-07-04')
		]).map((i) => i.id);
		expect(ordered).toEqual(['mid', 'coarse', 'fine']);
	});

	it('keeps clusters together, in date order, undated last', () => {
		const ordered = orderByCluster([
			item('late', 'b', '2020'),
			item('undated', 'c', null),
			item('early', 'a', '2012-05'),
			item('late-2', 'b', null),
			item('early-2', 'a', '2012')
		]).map((i) => i.id);
		expect(ordered).toEqual(['early', 'early-2', 'late', 'late-2', 'undated']);
	});
});

describe('groupBySeason', () => {
	it('gathers clusters into seasons, in date order, never splitting a cluster', () => {
		const groups = groupBySeason([
			item('undated', 'u', null),
			item('july', 'a', '2024-07-04'),
			item('july-photo', 'a', '2024-09-02'),
			item('december', 'b', '2023-12-10'),
			item('february', 'c', '2024-02'),
			item('year', 'd', '2024')
		]);
		expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
			['2024', ['year']],
			['Winter 2024', ['december', 'february']],
			['Summer 2024', ['july', 'july-photo']],
			['Undated', ['undated']]
		]);
	});
});

describe('layoutField', () => {
	const viewW = 1920;
	const viewH = 1080;
	const world = layoutField(many(400), { viewW, viewH });

	it('places every item exactly once', () => {
		expect(world.placed).toHaveLength(400);
		expect(new Set(world.placed.map((p) => p.item.id)).size).toBe(400);
	});

	it('keeps every item inside the world', () => {
		for (const p of world.placed) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(world.width);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeLessThanOrEqual(world.height);
		}
	});

	it('is wider and taller than a screen, so nothing shows twice across the seam', () => {
		const small = layoutField(many(3), { viewW, viewH });
		expect(small.width).toBeGreaterThan(viewW);
		expect(small.height).toBeGreaterThan(viewH);
	});

	it('shows about the asked number of items per screen over an island, fewer on average', () => {
		const perScreen = (400 * viewW * viewH) / (world.width * world.height);
		expect(perScreen).toBeGreaterThan(10);
		expect(perScreen).toBeLessThan(24);
		// Around a bubble, a screen's worth of island holds about the asked number.
		const summer = layoutField(
			Array.from({ length: 300 }, (_, i) => item(`s${i}`, `c${i}`, '2024-07-01')),
			{ viewW, viewH }
		);
		const [group] = summer.groups;
		const near = summer.placed.filter((p) => {
			const o = offsetFrom(group, p, summer);
			return Math.abs(o.x) < viewW / 2 && Math.abs(o.y) < viewH / 2;
		});
		expect(near.length).toBeGreaterThan(16);
		expect(near.length).toBeLessThan(26);
	});

	it('gives each season one bubble, in date order', () => {
		const labels = world.groups.map((g) => g.label);
		expect(labels).toEqual(groupBySeason(many(400)).map((g) => g.label));
		expect(labels.length).toBeGreaterThan(5);
		expect([...labels].sort()).toEqual(labels);
	});

	it('keeps the water clear at each bubble', () => {
		for (const group of world.groups) {
			for (const p of world.placed) {
				const o = offsetFrom(group, p, world);
				// The bubble's three cells, less how far an item may be nudged and its half-size.
				const clear = Math.abs(o.y) < world.cell * 0.4 && Math.abs(o.x) < world.cell * 1.4;
				expect(clear).toBe(false);
			}
		}
	});

	it('parts the seasons by open water, wider than the gaps within one', () => {
		const seasonOf = new Map(
			groupBySeason(many(400)).flatMap((g) => g.items.map((i) => [i.id, g.key]))
		);
		let closest = Infinity;
		for (const p of world.placed) {
			for (const q of world.placed) {
				if (seasonOf.get(p.item.id) === seasonOf.get(q.item.id)) continue;
				const o = offsetFrom(p, q, world);
				closest = Math.min(closest, Math.hypot(o.x, o.y));
			}
		}
		// Within an island, neighbors sit about a cell apart.
		expect(closest).toBeGreaterThan(world.cell * 1.3);
	});

	it('is the same every time', () => {
		const again = layoutField(many(400), { viewW, viewH });
		expect(again.placed.map((p) => [p.x, p.y])).toEqual(world.placed.map((p) => [p.x, p.y]));
	});

	it('keeps a cluster near itself', () => {
		const byId = new Map(world.placed.map((p) => [p.item.id, p]));
		// i0..i3 share a cluster.
		const a = byId.get('i0')!;
		for (const id of ['i1', 'i2', 'i3']) {
			const b = byId.get(id)!;
			const o = offsetFrom(a, b, world);
			expect(Math.hypot(o.x, o.y)).toBeLessThan(world.cell * 6);
		}
	});

	it('copes with an empty archive', () => {
		const empty = layoutField([], { viewW, viewH });
		expect(empty.placed).toEqual([]);
		expect(empty.width).toBeGreaterThan(0);
	});
});

describe('nearestItem', () => {
	const world = layoutField(many(50), { viewW: 1000, viewH: 600 });

	it('finds the item at a point', () => {
		const p = world.placed[7];
		expect(nearestItem(world, { x: p.x + 1, y: p.y })).toEqual({ x: p.x, y: p.y });
	});

	it('looks across the seam, answering beside the point', () => {
		const p = world.placed[0];
		const from = { x: p.x + world.width, y: p.y + world.height };
		const found = nearestItem(world, from)!;
		expect(found.x).toBeCloseTo(from.x);
		expect(found.y).toBeCloseTo(from.y);
	});

	it('answers null when nothing is within reach', () => {
		expect(nearestItem(layoutField([], { viewW: 100, viewH: 100 }), { x: 0, y: 0 })).toBeNull();
		expect(
			nearestItem(world, { x: world.placed[0].x + 0.5, y: world.placed[0].y }, 0.1)
		).toBeNull();
	});
});

describe('focus', () => {
	it('falls smoothly and steadily from the center to the edge of the lens', () => {
		expect(focusAmount(0, 100)).toBe(1);
		expect(focusAmount(100, 100)).toBe(0);
		expect(focusAmount(250, 100)).toBe(0);
		let last = 1;
		for (let d = 0; d <= 100; d += 5) {
			const f = focusAmount(d, 100);
			expect(f).toBeLessThanOrEqual(last);
			last = f;
		}
	});

	it('holds the bloom back while the field moves fast', () => {
		const still = focusScale(1, calmness(0), 4);
		const moving = focusScale(1, calmness(2000), 4);
		expect(still).toBe(4);
		expect(moving).toBeGreaterThan(1);
		expect(moving).toBeLessThan(2);
		expect(focusScale(0, 1, 4)).toBe(1);
	});

	it('blooms an item to fit the screen, never shrinking it', () => {
		expect(bloomScale(100, 100, 1920, 1080)).toBeCloseTo((1080 * 0.62) / 100);
		// A wide panorama is held by the width instead.
		expect(bloomScale(400, 100, 1920, 1080)).toBeCloseTo((1920 * 0.5) / 400);
		expect(bloomScale(5000, 5000, 1920, 1080)).toBe(1);
	});

	it('parts neighbors outward, and only those within reach', () => {
		const push = parting({ x: 30, y: 40 }, 100, 1);
		expect(push.x).toBeGreaterThan(0);
		expect(push.y).toBeGreaterThan(0);
		expect(push.y / push.x).toBeCloseTo(40 / 30);
		expect(parting({ x: 300, y: 0 }, 100, 1)).toEqual({ x: 0, y: 0 });
		expect(parting({ x: 30, y: 0 }, 100, 0)).toEqual({ x: 0, y: 0 });
	});
});

describe('buildFieldItems', () => {
	const items = buildFieldItems({
		artefacts: [
			{
				id: 1,
				artefact: 'Program',
				date: '2019-07',
				fileUrls: ['/artefacts/a_page_1.webp', '/artefacts/a.pdf', '/artefacts/a_page_2.webp'],
				event: 'Garden Party'
			},
			{ id: 2, artefact: 'Loose flyer', date: null, fileUrls: ['/artefacts/b.webp'], event: null }
		],
		imageSets: [
			{
				id: 5,
				description: 'Set',
				event: 'Garden Party',
				date: '2019',
				images: [
					{
						id: 9,
						url: 'https://bucket.test/9.webp',
						width: 1600,
						height: 1200,
						placeholder: 'abc',
						capturedDate: null
					}
				]
			}
		],
		events: [
			{
				id: 3,
				title: 'Garden Party',
				date: '2019-07-04',
				time: null,
				location: null,
				description: null,
				hosts: [],
				url: null,
				featureImage: { url: 'https://bucket.test/9.webp', width: 1600, height: 1200 }
			},
			{
				id: 6,
				title: 'Garden Party',
				date: '2021-07-03',
				time: null,
				location: null,
				description: null,
				hosts: [],
				url: null
			},
			{
				id: 4,
				title: 'Jazz Night: Live!  (Second set)',
				date: null,
				time: null,
				location: null,
				description: null,
				hosts: [],
				url: null
			}
		]
	});
	const byId = new Map(items.map((i) => [i.id, i]));

	it('takes each raster page of each artefact, and skips PDFs', () => {
		expect(items.filter((i) => i.kind === 'artefact').map((i) => i.id)).toEqual([
			'a1-0',
			'a1-2',
			'a2-0'
		]);
	});

	it('clusters an event with its artefacts and photographs', () => {
		const cluster = byId.get('e3')!.cluster;
		expect(byId.get('a1-0')!.cluster).toBe(cluster);
		expect(byId.get('p9')!.cluster).toBe(cluster);
		expect(byId.get('a2-0')!.cluster).not.toBe(cluster);
	});

	it('joins the same-titled event nearest in date, not every one of them', () => {
		expect(byId.get('e6')!.cluster).not.toBe(byId.get('e3')!.cluster);
		expect(byId.get('a1-0')!.cluster).toBe(byId.get('e3')!.cluster);
	});

	it('draws an event as a card when its picture already floats nearby', () => {
		expect(byId.get('e3')!.src).toBeNull();
	});

	it('keeps an event title exactly as the archive holds it', () => {
		expect(byId.get('e4')!.title).toBe('Jazz Night: Live!  (Second set)');
	});

	it('uses a photograph’s own shape and placeholder', () => {
		expect(byId.get('p9')!.aspect).toBeCloseTo(4 / 3);
		expect(byId.get('p9')!.placeholder).toBe('abc');
	});
});
