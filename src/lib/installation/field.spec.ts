import { describe, expect, it } from 'vitest';
import {
	bloomScale,
	calmness,
	carryCamera,
	floorZoom,
	focusAmount,
	focusScale,
	groupByCalendar,
	isPicture,
	itemScale,
	layoutField,
	nearestItem,
	offsetFrom,
	openHeight,
	orderByCluster,
	parting,
	placeMark,
	roomNeeded,
	thinningRoom,
	thinningStarts,
	widestZoom,
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
	details: null,
	cluster
});

// Clusters of four, spread over fifteen years and every month, plus some
// known only to the year.
const many = (n: number) =>
	Array.from({ length: n }, (_, i) => {
		const c = Math.floor(i / 4);
		const year = 2010 + (c % 15);
		const month = String(1 + ((c * 5) % 12)).padStart(2, '0');
		return item(`i${i}`, `c${c}`, c % 9 === 0 ? `${year}` : `${year}-${month}`);
	});

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

describe('groupByCalendar', () => {
	const calendar = groupByCalendar([
		item('undated', 'u', null),
		item('july', 'a', '2024-07-04'),
		item('july-photo', 'a', '2024-09-02'),
		item('december', 'b', '2023-12-10'),
		item('february', 'c', '2024-02'),
		item('year', 'd', '2024'),
		item('old-summer', 'e', '2016-08-20'),
		item('old-winter', 'f', '2017-01'),
		item('late-summer', 'g', '2024-08-30')
	]);
	const box = (year: string, season: string) =>
		calendar.cells
			.find(
				(c) => calendar.years[c.year].label === year && calendar.seasons[c.season].label === season
			)
			?.items.map((i) => i.id);

	it('keeps only the years and seasons that hold something, in order', () => {
		expect(calendar.years.map((y) => y.label)).toEqual(['2016', '2017', '2023', '2024', 'Undated']);
		expect(calendar.seasons.map((s) => s.label)).toEqual(['Winter', 'Summer', 'Season unknown']);
	});

	it('gathers each year by season, in date order, never splitting a cluster', () => {
		expect(box('2024', 'Summer')).toEqual(['july', 'july-photo', 'late-summer']);
		expect(box('2016', 'Summer')).toEqual(['old-summer']);
		expect(box('2024', 'Winter')).toEqual(['february']);
	});

	it('keeps a December in its own year', () => {
		expect(box('2023', 'Winter')).toEqual(['december']);
	});

	it('puts a year-only date in its year, an undated one in a column of its own', () => {
		expect(box('2024', 'Season unknown')).toEqual(['year']);
		expect(box('Undated', 'Season unknown')).toEqual(['undated']);
		expect(calendar.cells).toHaveLength(7);
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

	it('shows about the asked number of items per screen over a full season, fewer on average', () => {
		const perScreen = (400 * viewW * viewH) / (world.width * world.height);
		// The channels between years and seasons are open water, so well under the
		// default 37; the more so here, with fifteen years of about 27 things each.
		expect(perScreen).toBeGreaterThan(8);
		expect(perScreen).toBeLessThan(37);
		// Within one full season, a screen holds about the asked number, a little
		// under it for the empty places. Any one screen varies with which empty
		// places and columns of places it catches, so take the average of a few.
		const summer = layoutField(
			Array.from({ length: 300 }, (_, i) => item(`s${i}`, `c${i}`, '2024-07-01')),
			{ viewW, viewH }
		);
		const [{ start: left, end: right }] = summer.years;
		const [{ start: top, end: bottom }] = summer.seasons;
		const counts: number[] = [];
		for (const fx of [0.25, 0.5, 0.75]) {
			for (const fy of [0.25, 0.5, 0.75]) {
				// Screens wholly inside the season, none of them over its edge.
				const at = {
					x: left + viewW / 2 + (right - left - viewW) * fx,
					y: top + viewH / 2 + (bottom - top - viewH) * fy
				};
				counts.push(
					summer.placed.filter((p) => {
						const o = offsetFrom(at, p, summer);
						return Math.abs(o.x) < viewW / 2 && Math.abs(o.y) < viewH / 2;
					}).length
				);
			}
		}
		const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;
		expect(mean).toBeGreaterThan(29);
		expect(mean).toBeLessThan(37);
	});

	const calendar = groupByCalendar(many(400));
	const boxOf = new Map(
		calendar.cells.flatMap((c) => c.items.map((i) => [i.id, { year: c.year, season: c.season }]))
	);

	it('has a column for each year, oldest first, and a row for each season, winter first', () => {
		expect(world.years.map((b) => b.label)).toEqual(
			Array.from({ length: 15 }, (_, i) => String(2010 + i))
		);
		expect(world.seasons.map((b) => b.label)).toEqual([
			'Winter',
			'Spring',
			'Summer',
			'Fall',
			'Season unknown'
		]);
		for (const bands of [world.years, world.seasons]) {
			bands.forEach((band, i) => {
				expect(band.end).toBeGreaterThan(band.start);
				if (i > 0) expect(band.start).toBeGreaterThan(bands[i - 1].end);
			});
		}
		expect(world.years.at(-1)!.end).toBeLessThan(world.width);
		expect(world.seasons.at(-1)!.end).toBeLessThan(world.height);
	});

	it('puts each item in its year’s column and its season’s row', () => {
		for (const p of world.placed) {
			const { year, season } = boxOf.get(p.item.id)!;
			expect(p.x).toBeGreaterThan(world.years[year].start);
			expect(p.x).toBeLessThan(world.years[year].end);
			expect(p.y).toBeGreaterThan(world.seasons[season].start);
			expect(p.y).toBeLessThan(world.seasons[season].end);
		}
	});

	it('runs a year’s season left to right in date order', () => {
		const summer = layoutField(
			// June 1 to August 31, three or four things a day, in id order.
			Array.from({ length: 300 }, (_, i) =>
				item(
					`s${i}`,
					`c${i}`,
					new Date(Date.UTC(2024, 5, 1 + Math.floor(i / 3.3))).toISOString().slice(0, 10)
				)
			),
			{ viewW, viewH }
		);
		const x = new Map(summer.placed.map((p) => [p.item.id, p.x]));
		// Items a few columns of places apart in date order are in order across.
		let inOrder = 0;
		let pairs = 0;
		for (let i = 0; i + 40 < 300; i++) {
			pairs++;
			if (x.get(`s${i}`)! < x.get(`s${i + 40}`)!) inOrder++;
		}
		expect(inOrder / pairs).toBeGreaterThan(0.95);
	});

	it('parts the years and the seasons by open water, wider than the gaps within one', () => {
		let closest = Infinity;
		for (const p of world.placed) {
			const a = boxOf.get(p.item.id)!;
			for (const q of world.placed) {
				const b = boxOf.get(q.item.id)!;
				if (a.year === b.year && a.season === b.season) continue;
				const o = offsetFrom(p, q, world);
				closest = Math.min(closest, Math.hypot(o.x, o.y));
			}
		}
		// Within a box, neighbors sit about a cell apart.
		expect(closest).toBeGreaterThan(world.cell * 1.3);
	});

	it('never crowds a season, however busy it is beside quiet ones', () => {
		// One year with a winter as busy as its summer.
		const busy = layoutField(
			[
				...Array.from({ length: 120 }, (_, i) => item(`w${i}`, `w${i}`, '2022-01-10')),
				...Array.from({ length: 120 }, (_, i) => item(`s${i}`, `s${i}`, '2022-07-10')),
				...Array.from({ length: 120 }, (_, i) => item(`t${i}`, `t${i}`, '2023-07-10'))
			],
			{ viewW, viewH }
		);
		let closest = Infinity;
		for (const p of busy.placed) {
			for (const q of busy.placed) {
				if (p === q) continue;
				const o = offsetFrom(p, q, busy);
				closest = Math.min(closest, Math.hypot(o.x, o.y));
			}
		}
		// Places a cell apart, less how far two may be nudged toward each other.
		expect(closest).toBeGreaterThan(busy.cell * 0.5);
	});

	it('leaves wider water where the newest year wraps round to the oldest', () => {
		const gaps = world.years.slice(1).map((band, i) => band.start - world.years[i].end);
		const wrap = world.width - world.years.at(-1)!.end + world.years[0].start;
		for (const gap of gaps) expect(gap).toBeCloseTo(world.cell);
		expect(wrap).toBeCloseTo(world.cell * 3);
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

	it('opens a card as tall as its words need, up to the most it may take', () => {
		// 800 wide, bloomed to 615 tall: words needing 1× its width want 800.
		expect(openHeight(800, 615, 1, 1000, 1)).toBe(800);
		expect(openHeight(800, 615, 1, 1000, 0.5)).toBeCloseTo((615 + 800) / 2);
		expect(openHeight(800, 615, 3, 1000, 1)).toBe(1000);
		// Words that already fit, or a cap below the bloom, leave it as it is.
		expect(openHeight(800, 615, 0.5, 1000, 1)).toBe(615);
		expect(openHeight(800, 615, 1, 500, 1)).toBe(615);
		expect(openHeight(800, 615, 2, 1000, 0)).toBe(615);
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

describe('carryCamera', () => {
	const view = { viewW: 1920, viewH: 1080 };
	const all = Array.from({ length: 80 }, (_, i) =>
		item(
			`i${i}`,
			`c${i}`,
			`2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
			i % 2 ? 'photo' : 'event'
		)
	);
	const from = layoutField(all, view);
	const to = layoutField(
		all.filter((i) => i.kind === 'photo'),
		view
	);

	it('keeps an item that stays where it was on screen', () => {
		const on = from.placed.find((p) => p.item.kind === 'photo')!;
		const cam = { x: on.x - 30, y: on.y + 12 };
		const next = carryCamera(from, to, cam)!;
		const now = to.placed.find((p) => p.item.id === on.item.id)!;
		expect(now.x - next.x).toBeCloseTo(30);
		expect(now.y - next.y).toBeCloseTo(-12);
	});

	it('goes to the nearest item that stays when the one in view is gone', () => {
		const gone = from.placed.find((p) => p.item.kind === 'event')!;
		const next = carryCamera(from, to, gone)!;
		const stays = from.placed
			.filter((p) => p.item.kind === 'photo')
			.map((p) => ({ p, offset: offsetFrom(gone, p, from) }))
			.sort((a, b) => Math.hypot(a.offset.x, a.offset.y) - Math.hypot(b.offset.x, b.offset.y))[0];
		const now = to.placed.find((p) => p.item.id === stays.p.item.id)!;
		expect(now.x - next.x).toBeCloseTo(stays.offset.x);
		expect(now.y - next.y).toBeCloseTo(stays.offset.y);
	});

	it('has nowhere to go when the layouts share nothing', () => {
		expect(carryCamera(from, layoutField([], view), { x: 0, y: 0 })).toBeNull();
		expect(carryCamera(layoutField([], view), to, { x: 0, y: 0 })).toBeNull();
	});
});

describe('buildFieldItems', () => {
	const data = {
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
				time: '7:00 PM - 9:00 PM',
				location: null,
				description: 'Two sets.\n\nBring a chair.',
				hosts: ['Rae', 'The Alley Band'],
				url: null
			}
		]
	};
	const items = buildFieldItems(data);
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

	it('carries an event’s details verbatim, and none for pictures', () => {
		expect(byId.get('e4')!.details).toEqual({
			time: '7:00 PM - 9:00 PM',
			description: 'Two sets.\n\nBring a chair.',
			hosts: ['Rae', 'The Alley Band']
		});
		expect(byId.get('a1-0')!.details).toBeNull();
		expect(byId.get('p9')!.details).toBeNull();
	});

	it('leaves out the kinds that are not wanted', () => {
		const only = buildFieldItems({ ...data, kinds: new Set(['artefact', 'event'] as const) });
		expect(new Set(only.map((i) => i.kind))).toEqual(new Set(['artefact', 'event']));
		expect(buildFieldItems({ ...data, kinds: new Set() })).toEqual([]);
	});

	it('still gathers artefacts by event when the events are hidden', () => {
		const only = buildFieldItems({ ...data, kinds: new Set(['artefact', 'photo'] as const) });
		const cluster = (id: string) => only.find((i) => i.id === id)!.cluster;
		expect(cluster('a1-0')).toBe(cluster('p9'));
		expect(cluster('a2-0')).not.toBe(cluster('a1-0'));
	});

	it('gives an event its picture back when the photograph showing it is hidden', () => {
		const only = buildFieldItems({ ...data, kinds: new Set(['event'] as const) });
		expect(only.find((i) => i.id === 'e3')!.src).toBe('https://bucket.test/9.webp');
	});

	it('uses a photograph’s own shape and placeholder', () => {
		expect(byId.get('p9')!.aspect).toBeCloseTo(4 / 3);
		expect(byId.get('p9')!.placeholder).toBe('abc');
	});
});

describe('thinningRoom', () => {
	// Two summers, densely full, as most of the archive is.
	const world = layoutField(
		many(300).map((it, i) => ({
			...it,
			date: `${2023 + (Math.floor(i / 4) % 2)}-07`,
			...(i % 5 === 0 ? { kind: 'event' as const, src: null } : {})
		})),
		{ viewW: 1600, viewH: 900 }
	);
	const tierOf = (p: (typeof world.placed)[number]) => (isPicture(p.item) ? 0 : 1);
	const room = thinningRoom(world, tierOf);

	it('gives one item infinite room and every other a finite one', () => {
		const infinite = [...room].filter((r) => r === Infinity);
		expect(infinite).toHaveLength(1);
		expect([...room].every((r) => r > 0)).toBe(true);
	});

	it('keeps whatever is shown at a given room at least that far apart', () => {
		for (const need of [world.cell * 0.8, world.cell * 1.5, world.cell * 3]) {
			const kept = world.placed.filter((_, i) => room[i] >= need);
			expect(kept.length).toBeGreaterThan(0);
			for (let a = 0; a < kept.length; a++) {
				for (let b = a + 1; b < kept.length; b++) {
					const o = offsetFrom(kept[a], kept[b], world);
					expect(Math.hypot(o.x, o.y)).toBeGreaterThanOrEqual(need - 1e-6);
				}
			}
		}
	});

	it('thins evenly rather than leaving bare patches', () => {
		// Farthest-point sampling covers as it thins: every picture left out is
		// within the room of one that stays.
		for (const need of [world.cell * 1.2, world.cell * 2, world.cell * 3]) {
			const pictures = world.placed.flatMap((p, i) => (isPicture(p.item) ? [i] : []));
			const kept = pictures.filter((i) => room[i] >= need);
			for (const i of pictures) {
				const nearest = Math.min(
					...kept.map((k) => {
						const o = offsetFrom(world.placed[i], world.placed[k], world);
						return Math.hypot(o.x, o.y);
					})
				);
				expect(nearest).toBeLessThan(need);
			}
		}
	});

	it('places every picture before any card, so cards thin first', () => {
		const order = world.placed
			.map((p, i) => ({ picture: isPicture(p.item), room: room[i] }))
			.sort((a, b) => b.room - a.room);
		// A card's room is measured to the pictures too, so it is never more than
		// the gap to its nearest picture, while pictures are measured only to each other.
		const cards = order.filter((o) => !o.picture);
		const leastPicture = Math.min(...order.filter((o) => o.picture).map((o) => o.room));
		expect(cards.length).toBeGreaterThan(0);
		for (const card of cards) expect(card.room).toBeLessThanOrEqual(world.cell * 1.6);
		expect(leastPicture).toBeGreaterThan(world.cell * 0.5);
	});
});

describe('zoom levels', () => {
	it('lets pictures shrink with the zoom down to the floor, then only slowly', () => {
		expect(itemScale(1, 0.5)).toBe(1);
		expect(itemScale(0.5, 0.5)).toBe(0.5);
		expect(itemScale(0.25, 0.5)).toBeGreaterThan(0.4);
		expect(itemScale(0.25, 0.5)).toBeLessThan(0.5);
	});

	it('puts the floor where a cell is a set share of the screen, never above 1', () => {
		expect(floorZoom(200, 1000, 0.1)).toBeCloseTo(0.5);
		expect(floorZoom(50, 1000, 0.1)).toBe(1);
	});

	it('needs a fixed room on screen, so more world as it zooms out', () => {
		expect(roomNeeded(1, 1000, 0.1)).toBeCloseTo(100);
		expect(roomNeeded(0.25, 1000, 0.1)).toBeCloseTo(400);
	});

	it('begins thinning where the least room stops being enough', () => {
		const zoom = thinningStarts([300, 150, 600], 1000);
		expect(roomNeeded(zoom, 1000)).toBeCloseTo(150);
		expect(thinningStarts([], 1000)).toBe(0);
	});

	it('zooms no farther out than one world fits the screen', () => {
		expect(widestZoom({ width: 4000, height: 2000 }, 1000, 800, 100)).toBeCloseTo(0.5);
	});
});

describe('placeMark', () => {
	const band = { key: 'b', label: 'B', start: 1000, end: 3000 };
	const size = 10_000;

	it('names a band filling the screen at the middle, over the lens', () => {
		const place = placeMark(band, 2000, size, 1, -500, 500, 100);
		expect(place).toEqual({ at: 0, room: 900, current: true });
	});

	it('sits at the middle of the stretch of its band in view', () => {
		// The band runs from 100 px left of center to well past the right edge.
		const place = placeMark(band, 1100, size, 1, -500, 500, 100)!;
		expect(place.at).toBe(200);
		expect(place.current).toBe(true);
	});

	it('never leaves its band, and runs out of room as the band leaves', () => {
		// Only the band's last 50 px are in view, at the screen's left edge.
		const place = placeMark(band, 3450, size, 1, -500, 500, 100)!;
		expect(place.at).toBe(-475);
		expect(place.room).toBe(-50);
		expect(place.current).toBe(false);
		expect(placeMark(band, 4000, size, 1, -500, 500, 100)).toBeNull();
	});

	it('finds its band across the seam', () => {
		// Its left end is 1,200 px ahead, past the seam: out of view at this zoom...
		expect(placeMark(band, size - 200, size, 1, -500, 500, 100)).toBeNull();
		// ...but in view at the right edge, zoomed out.
		const out = placeMark(band, size - 200, size, 0.3, -500, 500, 100)!;
		expect(out.at).toBeCloseTo(430);
		expect(out.current).toBe(false);
	});

	it('keeps to the stretch of the screen it is given', () => {
		// In view from -1,600 to 400, but the marks may only use from -300.
		const place = placeMark(band, 2600, size, 1, -300, 500, 100)!;
		expect(place.at).toBe(50);
	});
});
