import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

await vi.hoisted(async () => {
	const { useTestDatabaseUrl } = await import('./db/testing');
	useTestDatabaseUrl();
});
// SvelteKit only populates $env/dynamic/private inside a running server.
vi.mock('$env/dynamic/private', () => ({ env: process.env }));

const { client, db } = await import('./db');
const { migrateTestDatabase } = await import('./db/testing');
const { artefact, event, eventFeatureImage, image, imageSet, user } = await import('./db/schema');
const { canFeature, listFeatureCandidates, loadFeatureImage, setFeatureImage } =
	await import('./eventFeatures');

const ADMIN = 'admin-1';
const OTHER_ADMIN = 'admin-2';

beforeAll(async () => {
	await migrateTestDatabase();
	await db.insert(user).values([
		{ id: ADMIN, name: 'Admin', email: 'admin@example.org', role: 'admin' },
		{ id: OTHER_ADMIN, name: 'Other', email: 'other@example.org', role: 'admin' }
	]);
});

let seq = 0;

async function newEvent(title = 'Garden Concert', proposedAddition = false) {
	const [row] = await db
		.insert(event)
		.values({ title, date: '2024-06-01', proposedAddition })
		.returning({ id: event.id });
	return row.id;
}

async function newArtefact(
	fileUrls: string[],
	{ eventId = null as number | null, title = 'Program', proposedAddition = false } = {}
) {
	const [row] = await db
		.insert(artefact)
		.values({ artefact: title, date: '2024', fileUrls, eventId, proposedAddition })
		.returning({ id: artefact.id });
	return row.id;
}

/** A set holding `count` photographs; returns the set id and the photographs' ids in order. */
async function newSet(
	count: number,
	{
		eventId = null as number | null,
		description = 'Photographs' as string | null,
		proposedAddition = false
	} = {}
) {
	const [set] = await db
		.insert(imageSet)
		.values({ eventId, description, proposedAddition, date: '2024-06-01' })
		.returning({ id: imageSet.id });
	const ids: number[] = [];
	for (let position = 0; position < count; position++) {
		const n = ++seq;
		const [row] = await db
			.insert(image)
			.values({
				setId: set.id,
				position,
				url: `https://bucket.test/images/${n}/display.webp`,
				originalUrl: `https://bucket.test/images/${n}/original.heic`,
				originalType: 'image/heic',
				originalBytes: 100,
				bytes: 50,
				width: 2560,
				height: 1920
			})
			.returning({ id: image.id });
		ids.push(row.id);
	}
	return { setId: set.id, imageIds: ids };
}

const page = (name: string) => `https://bucket.test/submissions/${name}`;

async function storedRow(eventId: number) {
	const [row] = await db
		.select()
		.from(eventFeatureImage)
		.where(eq(eventFeatureImage.eventId, eventId));
	return row;
}

describe('setFeatureImage', () => {
	it('features a photograph from a set', async () => {
		const eventId = await newEvent();
		const { setId, imageIds } = await newSet(2, { description: 'Evening light' });

		expect(await setFeatureImage(eventId, { kind: 'image', imageId: imageIds[1] }, ADMIN)).toBe(
			true
		);
		expect(await loadFeatureImage(eventId, { vettedOnly: false })).toEqual({
			url: expect.stringContaining('/display.webp'),
			width: 2560,
			height: 1920,
			ref: { kind: 'image', imageId: imageIds[1] },
			source: { kind: 'image', setId, label: 'Evening light', proposed: false }
		});
		expect(await storedRow(eventId)).toMatchObject({ createdBy: ADMIN, updatedBy: ADMIN });
	});

	it('features an image page of an artefact', async () => {
		const eventId = await newEvent();
		const url = page('flyer.webp');
		const artefactId = await newArtefact([page('cover.webp'), url], { title: 'Flyer' });

		expect(await setFeatureImage(eventId, { kind: 'artefact', artefactId, url }, ADMIN)).toBe(true);
		expect(await loadFeatureImage(eventId, { vettedOnly: false })).toEqual({
			url,
			width: null,
			height: null,
			ref: { kind: 'artefact', artefactId, url },
			source: { kind: 'artefact', artefactId, label: 'Flyer', proposed: false }
		});
	});

	it('replaces the choice, keeping one row per event', async () => {
		const eventId = await newEvent();
		const { imageIds } = await newSet(1);
		const url = page('replace.webp');
		const artefactId = await newArtefact([url]);

		await setFeatureImage(eventId, { kind: 'image', imageId: imageIds[0] }, ADMIN);
		await setFeatureImage(eventId, { kind: 'artefact', artefactId, url }, OTHER_ADMIN);

		const rows = await db
			.select()
			.from(eventFeatureImage)
			.where(eq(eventFeatureImage.eventId, eventId));
		expect(rows).toEqual([
			expect.objectContaining({
				imageId: null,
				artefactId,
				artefactFileUrl: url,
				createdBy: ADMIN,
				updatedBy: OTHER_ADMIN
			})
		]);
	});

	it("doesn't rewrite an unchanged choice, so its audit columns hold", async () => {
		const eventId = await newEvent();
		const { imageIds } = await newSet(1);
		await setFeatureImage(eventId, { kind: 'image', imageId: imageIds[0] }, ADMIN);
		const before = await storedRow(eventId);

		expect(
			await setFeatureImage(eventId, { kind: 'image', imageId: imageIds[0] }, OTHER_ADMIN)
		).toBe(true);
		expect(await storedRow(eventId)).toEqual(before);
	});

	it('clears the choice with null', async () => {
		const eventId = await newEvent();
		const { imageIds } = await newSet(1);
		await setFeatureImage(eventId, { kind: 'image', imageId: imageIds[0] }, ADMIN);

		expect(await setFeatureImage(eventId, null, ADMIN)).toBe(true);
		expect(await storedRow(eventId)).toBeUndefined();
	});

	it('refuses what cannot be featured, writing nothing', async () => {
		const eventId = await newEvent();
		const { setId, imageIds } = await newSet(1);
		const pdf = page('minutes.pdf');
		const artefactId = await newArtefact([page('kept.webp'), pdf]);
		// A photograph let go of by its set: unattached, and soon swept.
		await client.execute({ sql: 'UPDATE image SET set_id = NULL WHERE set_id = ?', args: [setId] });

		const refused = [
			{ kind: 'image' as const, imageId: imageIds[0] },
			{ kind: 'image' as const, imageId: 999_999 },
			{ kind: 'artefact' as const, artefactId, url: page('elsewhere.webp') },
			{ kind: 'artefact' as const, artefactId, url: pdf },
			{ kind: 'artefact' as const, artefactId: 999_999, url: page('kept.webp') }
		];
		for (const ref of refused) {
			expect(await setFeatureImage(eventId, ref, ADMIN), JSON.stringify(ref)).toBe(false);
		}
		expect(await storedRow(eventId)).toBeUndefined();
	});

	it('refuses an event that does not exist', async () => {
		const { imageIds } = await newSet(1);
		expect(await setFeatureImage(999_999, { kind: 'image', imageId: imageIds[0] }, ADMIN)).toBe(
			false
		);
	});
});

describe('the stored choice', () => {
	it('stops resolving once its page leaves the artefact', async () => {
		const eventId = await newEvent();
		const url = page('dropped.webp');
		const artefactId = await newArtefact([url, page('stays.webp')]);
		await setFeatureImage(eventId, { kind: 'artefact', artefactId, url }, ADMIN);

		await db
			.update(artefact)
			.set({ fileUrls: [page('stays.webp')] })
			.where(eq(artefact.id, artefactId));
		expect(await loadFeatureImage(eventId, { vettedOnly: false })).toBeNull();
	});

	it('stops resolving once its photograph leaves the set', async () => {
		const eventId = await newEvent();
		const { imageIds } = await newSet(1);
		await setFeatureImage(eventId, { kind: 'image', imageId: imageIds[0] }, ADMIN);

		await db.update(image).set({ setId: null }).where(eq(image.id, imageIds[0]));
		expect(await loadFeatureImage(eventId, { vettedOnly: false })).toBeNull();
	});

	it('resolves a pending source only for keepers', async () => {
		const eventId = await newEvent();
		const { imageIds } = await newSet(1, { proposedAddition: true });
		await setFeatureImage(eventId, { kind: 'image', imageId: imageIds[0] }, ADMIN);

		expect((await loadFeatureImage(eventId, { vettedOnly: false }))?.source.proposed).toBe(true);
		expect(await loadFeatureImage(eventId, { vettedOnly: true })).toBeNull();
	});

	it('goes with the event, the artefact, or the set', async () => {
		const byEvent = await newEvent();
		const byArtefact = await newEvent();
		const bySet = await newEvent();
		const url = page('cascade.webp');
		const artefactId = await newArtefact([url]);
		const { setId, imageIds } = await newSet(1);
		const { imageIds: kept } = await newSet(1);
		await setFeatureImage(byEvent, { kind: 'image', imageId: kept[0] }, ADMIN);
		await setFeatureImage(byArtefact, { kind: 'artefact', artefactId, url }, ADMIN);
		await setFeatureImage(bySet, { kind: 'image', imageId: imageIds[0] }, ADMIN);

		await db.delete(event).where(eq(event.id, byEvent));
		await db.delete(artefact).where(eq(artefact.id, artefactId));
		// The set's photographs cascade with it, and the choice with them.
		await db.delete(imageSet).where(eq(imageSet.id, setId));

		for (const eventId of [byEvent, byArtefact, bySet]) {
			expect(await storedRow(eventId)).toBeUndefined();
		}
	});

	it('can never name both a photograph and a page, or a page without its artefact', async () => {
		const eventId = await newEvent();
		const { imageIds } = await newSet(1);
		const url = page('both.webp');
		const artefactId = await newArtefact([url]);

		const insert = (imageId: number | null, artefact: number | null, fileUrl: string | null) =>
			client.execute({
				sql: 'INSERT INTO event_feature_image (event_id, image_id, artefact_id, artefact_file_url) VALUES (?, ?, ?, ?)',
				args: [eventId, imageId, artefact, fileUrl]
			});
		await expect(insert(imageIds[0], artefactId, url)).rejects.toThrow(/CHECK/);
		await expect(insert(null, artefactId, null)).rejects.toThrow(/CHECK/);
		await expect(insert(imageIds[0], null, url)).rejects.toThrow(/CHECK/);
		await expect(insert(null, null, null)).rejects.toThrow(/CHECK/);
	});
});

describe('listFeatureCandidates', () => {
	it('splits what is linked to the event from the rest of the archive', async () => {
		const eventId = await newEvent('Linked Picnic');
		const otherEvent = await newEvent('Other Picnic');
		const linkedArtefact = await newArtefact([page('linked.webp'), page('notes.pdf')], {
			eventId,
			title: 'Linked flyer'
		});
		const { setId: linkedSet, imageIds } = await newSet(2, { eventId, description: null });
		const elsewhere = await newArtefact([page('elsewhere-1.webp')], {
			eventId: otherEvent,
			title: 'Unrelated poster'
		});
		// Nothing that could be featured: no image pages, or no photographs.
		await newArtefact([page('only.pdf')], { eventId, title: 'PDF only' });
		await newSet(0, { eventId });

		const linked = await listFeatureCandidates(eventId, { linked: true });
		expect(linked.truncated).toBe(false);
		expect(linked.groups.map((g) => [g.kind, g.id]).sort()).toEqual(
			[
				['artefact', linkedArtefact],
				['imageSet', linkedSet]
			].sort()
		);
		const set = linked.groups.find((g) => g.kind === 'imageSet')!;
		// Named after the event the photographs were taken at.
		expect(set.label).toBe('Linked Picnic');
		expect(set.images.map((i) => i.ref)).toEqual(imageIds.map((id) => `image:${id}`));
		const flyer = linked.groups.find((g) => g.kind === 'artefact')!;
		// The PDF page is left out.
		expect(flyer.images).toEqual([
			{
				ref: `artefact:${linkedArtefact}:${page('linked.webp')}`,
				url: page('linked.webp'),
				width: null,
				height: null
			}
		]);

		const rest = await listFeatureCandidates(eventId, { linked: false });
		const restKeys = rest.groups.map((g) => `${g.kind}:${g.id}`);
		expect(restKeys).toContain(`artefact:${elsewhere}`);
		expect(restKeys).not.toContain(`artefact:${linkedArtefact}`);
		expect(restKeys).not.toContain(`imageSet:${linkedSet}`);
	});

	it('searches the rest of the archive by title, description, event and number', async () => {
		const eventId = await newEvent('Searching');
		const byTitle = await newArtefact([page('lantern.webp')], { title: 'Lantern parade map' });
		const byNumber = await newArtefact([page('numbered.webp')], { title: 'Numbered thing' });
		const setEvent = await newEvent('Harvest Supper');
		const { setId: byEventTitle } = await newSet(1, { eventId: setEvent, description: null });
		const { setId: byDescription } = await newSet(1, { description: 'Snow on the beds' });

		const keys = async (q: string) =>
			(await listFeatureCandidates(eventId, { linked: false, q })).groups.map(
				(g) => `${g.kind}:${g.id}`
			);
		expect(await keys('LANTERN')).toEqual([`artefact:${byTitle}`]);
		expect(await keys(`#${byNumber}`)).toEqual([`artefact:${byNumber}`]);
		expect(await keys('harvest')).toEqual([`imageSet:${byEventTitle}`]);
		expect(await keys('snow on')).toEqual([`imageSet:${byDescription}`]);
		// LIKE wildcards in a query are matched literally.
		expect(await keys('%')).toEqual([]);
	});

	it('flags pending submissions rather than hiding them', async () => {
		const eventId = await newEvent('Pending finds');
		const pending = await newArtefact([page('pending.webp')], {
			title: 'Pending zine',
			proposedAddition: true
		});
		const { groups } = await listFeatureCandidates(eventId, { linked: false, q: 'pending zine' });
		expect(groups).toEqual([expect.objectContaining({ id: pending, proposed: true })]);
	});
});

describe('canFeature', () => {
	it('agrees with what setFeatureImage accepts, writing nothing', async () => {
		const { imageIds } = await newSet(2);
		const url = page('can.webp');
		const artefactId = await newArtefact([url, page('can.pdf')]);
		await db.update(image).set({ setId: null }).where(eq(image.id, imageIds[1]));

		expect(await canFeature({ kind: 'image', imageId: imageIds[0] })).toBe(true);
		expect(await canFeature({ kind: 'artefact', artefactId, url })).toBe(true);
		expect(await canFeature({ kind: 'image', imageId: imageIds[1] })).toBe(false);
		expect(await canFeature({ kind: 'artefact', artefactId, url: page('can.pdf') })).toBe(false);
		expect(await canFeature({ kind: 'artefact', artefactId, url: page('nope.webp') })).toBe(false);
	});
});

describe('listFeatureCandidates for an event still being created', () => {
	it('lists nothing as linked, and searches every source', async () => {
		const someEvent = await newEvent('Already linked');
		const linkedElsewhere = await newArtefact([page('unborn.webp')], {
			eventId: someEvent,
			title: 'Unborn search target'
		});
		expect(await listFeatureCandidates(null, { linked: true })).toEqual({
			groups: [],
			truncated: false
		});
		const { groups } = await listFeatureCandidates(null, {
			linked: false,
			q: 'unborn search target'
		});
		expect(groups.map((g) => g.id)).toEqual([linkedElsewhere]);
	});
});
