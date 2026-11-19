import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./testing');
	useTestDatabaseUrl();
});
// SvelteKit fills $app/env/private when the Vite config loads, before this file sets
// the variables, so the spec hands the module the live process.env instead.
vi.mock('$app/env/private', async () => (await import('#lib/testing/env.ts')).privateEnv());

const { db } = await import('./index');
const { migrateTestDatabase } = await import('./testing');
const { loadPublicDataset } = await import('./queries');
const {
	artefact,
	artefactProvenance,
	event,
	eventFeatureImage,
	eventHost,
	image,
	imageSet,
	person
} = await import('./schema');

/** A well-formed ThumbHash (see #lib/images/placeholder). */
const HASH = 'H5sGDYRliUeUV2pDZWioEFShsOr1';

/** An image row carrying everything that must never be published. */
function photo(
	id: number,
	setId: number | null,
	position: number,
	capturedAt: string | null = '2024-06-01T14:03:09'
) {
	return {
		id,
		setId,
		position,
		url: `https://bucket.test/images/${id}/display.webp`,
		originalUrl: `https://bucket.test/images/${id}/original.heic`,
		originalType: 'image/heic' as const,
		originalName: `IMG_000${id}.HEIC`,
		originalBytes: 3_000_000,
		bytes: 400_000,
		width: 2560,
		height: 1920,
		placeholder: id === 3 ? null : HASH,
		capturedAt,
		capturedOffset: '+02:00',
		metadata: {
			gps: { latitude: 38.9165, longitude: -77.0311 },
			ifd0: { Make: 'Apple', Model: 'iPhone 15' }
		}
	};
}

beforeAll(async () => {
	await migrateTestDatabase();

	await db.insert(event).values([
		{ id: 1, title: 'Vetted Concert', date: '2024-06-01' },
		{ id: 2, title: 'Pending Picnic', date: '2024-07-01', proposedAddition: true }
	]);
	await db.insert(artefact).values([
		{ id: 1, artefact: 'Vetted program', date: '2024', eventId: 1 },
		{ id: 2, artefact: 'Pending flyer', date: '2024', proposedAddition: true },
		// Vetted itself, but linked to an event nobody has reviewed yet.
		{ id: 3, artefact: 'Vetted photo', date: '2024-07', eventId: 2 }
	]);
	await db.insert(person).values([
		{ id: 1, name: 'Vetted Contributor' },
		{ id: 2, name: 'Pending Contributor' },
		{ id: 3, name: 'Vetted Host' },
		{ id: 4, name: 'Pending Host' },
		{ id: 5, name: 'Orphan' }
	]);
	await db.insert(artefactProvenance).values([
		{ artefactId: 1, personId: 1 },
		{ artefactId: 2, personId: 2 }
	]);
	await db.insert(eventHost).values([
		{ eventId: 1, personId: 3 },
		{ eventId: 2, personId: 4 }
	]);
	await db.insert(imageSet).values([
		{ id: 1, description: 'Vetted set', eventId: 1, date: '2024-06-01' },
		// Vetted itself, but linked to an event nobody has reviewed yet.
		{ id: 2, description: 'Vetted set at a pending event', eventId: 2, date: '2023' },
		{ id: 3, description: 'Pending set', date: '2025', proposedAddition: true },
		// Vetted, but holding no photographs (a create that failed halfway).
		{ id: 4, description: 'Empty set', date: '2022' }
	]);
	// Inserted out of display order, so order must come from `position`.
	await db.insert(image).values([
		photo(1, 1, 2),
		photo(2, 1, 0),
		photo(3, 1, 1),
		// A camera with its clock never set: no day worth publishing.
		photo(4, 2, 0, '0000-00-00T00:00:00'),
		photo(5, 3, 0),
		photo(6, null, 0)
	]);

	await db.insert(event).values([
		{ id: 3, title: 'Featuring a vetted photograph', date: '2024-08-01' },
		{ id: 4, title: 'Featuring a pending photograph', date: '2024-08-02' },
		{ id: 5, title: 'Featuring a vetted page', date: '2024-08-03' },
		{ id: 6, title: 'Featuring a pending page', date: '2024-08-04' },
		{
			id: 7,
			title: 'Pending, featuring a vetted photograph',
			date: '2024-08-05',
			proposedAddition: true
		}
	]);
	await db.insert(artefact).values({
		id: 4,
		artefact: 'Pending poster',
		date: '2024',
		fileUrls: ['https://bucket.test/submissions/pending-poster.webp'],
		proposedAddition: true
	});
	await db
		.update(artefact)
		.set({ fileUrls: ['https://bucket.test/submissions/program.webp'] })
		.where(eq(artefact.id, 1));
	await db.insert(eventFeatureImage).values([
		{ eventId: 3, imageId: 3 },
		{ eventId: 4, imageId: 5 },
		{ eventId: 5, artefactId: 1, artefactFileUrl: 'https://bucket.test/submissions/program.webp' },
		{
			eventId: 6,
			artefactId: 4,
			artefactFileUrl: 'https://bucket.test/submissions/pending-poster.webp'
		},
		{ eventId: 7, imageId: 2 }
	]);
});

describe('loadPublicDataset', () => {
	it('publishes vetted artefacts only', async () => {
		const { artefacts } = await loadPublicDataset();
		expect(artefacts.map((a) => a.artefact).sort()).toEqual(['Vetted photo', 'Vetted program']);
	});

	it('publishes vetted events only', async () => {
		const { events } = await loadPublicDataset();
		expect(events.map((e) => e.title)).not.toContain('Pending Picnic');
		expect(events.map((e) => e.title)).not.toContain('Pending, featuring a vetted photograph');
		expect(events.find((e) => e.id === 1)?.hosts).toEqual(['Vetted Host']);
	});

	it("publishes an event's feature image only while its source is vetted", async () => {
		const { events } = await loadPublicDataset();
		const feature = new Map(events.map((e) => [e.id, e.featureImage]));
		expect(feature.get(1)).toBeNull();
		expect(feature.get(3)).toEqual({
			url: 'https://bucket.test/images/3/display.webp',
			width: 2560,
			height: 1920
		});
		expect(feature.get(4)).toBeNull();
		expect(feature.get(5)).toEqual({
			url: 'https://bucket.test/submissions/program.webp',
			width: null,
			height: null
		});
		expect(feature.get(6)).toBeNull();

		// Only what renders it: no ids, no labels, nothing of the original.
		const blob = JSON.stringify(events);
		for (const secret of ['original', 'IMG_000', 'imageId', 'artefactId', 'setId']) {
			expect(blob).not.toContain(secret);
		}
	});

	it("hides a pending event's title on a vetted artefact", async () => {
		const { artefacts } = await loadPublicDataset();
		const byTitle = new Map(artefacts.map((a) => [a.artefact, a]));
		expect(byTitle.get('Vetted program')?.event).toBe('Vetted Concert');
		expect(byTitle.get('Vetted photo')?.event).toBeNull();
	});

	it('lists only people linked to something vetted', async () => {
		const { people } = await loadPublicDataset();
		expect(people.sort()).toEqual(['Vetted Contributor', 'Vetted Host']);
	});

	it('publishes vetted image sets that hold photographs, newest first', async () => {
		const { images } = await loadPublicDataset();
		expect(images.map((set) => set.id)).toEqual([1, 2]);
		expect(images.flatMap((set) => set.images.map((i) => i.id)).sort()).toEqual([1, 2, 3, 4]);
	});

	it("hides a pending event's title on a vetted image set", async () => {
		const { images } = await loadPublicDataset();
		const byId = new Map(images.map((set) => [set.id, set]));
		expect(byId.get(1)?.event).toBe('Vetted Concert');
		expect(byId.get(2)?.event).toBeNull();
	});

	it('publishes each photograph as a whitelist, dated to the day only', async () => {
		const { images } = await loadPublicDataset();
		const [set] = images;
		expect(Object.keys(set).sort()).toEqual(['date', 'description', 'event', 'id', 'images']);
		for (const photograph of set.images) {
			expect(Object.keys(photograph).sort()).toEqual([
				'capturedDate',
				'height',
				'id',
				'placeholder',
				'url',
				'width'
			]);
		}
		expect(set.images[0]).toEqual({
			id: 2,
			url: 'https://bucket.test/images/2/display.webp',
			width: 2560,
			height: 1920,
			placeholder: HASH,
			capturedDate: '2024-06-01'
		});

		// Nothing of the originals, their metadata or the exact time reaches the blob.
		const blob = JSON.stringify(images);
		for (const secret of ['original', 'IMG_000', '38.9165', 'iPhone', '14:03', '+02:00']) {
			expect(blob).not.toContain(secret);
		}
	});

	it('publishes no capture day where the camera recorded no real one', async () => {
		const { images } = await loadPublicDataset();
		const set = images.find((s) => s.id === 2);
		expect(set?.images.map((i) => i.capturedDate)).toEqual([null]);
	});

	it('publishes a photograph that has no placeholder yet with null', async () => {
		const { images } = await loadPublicDataset();
		expect(images[0].images.map((i) => i.placeholder)).toEqual([HASH, null, HASH]);
	});

	it('lists photographs in display order', async () => {
		const { images } = await loadPublicDataset();
		expect(images[0].images.map((i) => i.id)).toEqual([2, 3, 1]);
	});
});
