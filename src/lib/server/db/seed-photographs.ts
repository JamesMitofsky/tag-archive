/**
 * Seeds the LOCAL dev archive with demo image sets: painted photographs (see
 * ./demoPhotos) uploaded to the local bucket and recorded through the same
 * code a real upload goes through — `finalizeImage` reads each one back,
 * checks it and parses its EXIF; `createImageSet` attaches them and dates the
 * set from their capture times. So the seeded rows are exactly what the
 * keeper pages, the review queue and /images would see from a real upload.
 *
 * What lands:
 *  - four published sets by the test admin: a five-photo set at an event, a
 *    single photograph, a set with no event spanning two days, and a set whose
 *    photographs carry no capture date (so it stays undated);
 *  - two sets awaiting review: one from the test contributor, one anonymous
 *    submission with contact details, as /contribute/images leaves them.
 *
 * Re-runnable: the local bucket starts empty on every dev boot, so each run
 * first removes the sets a previous run left (their photographs are named
 * `demo-…`), then seeds afresh. Local-only: refuses unless storage is the
 * local store and the database is not remote.
 *
 * Needs SvelteKit's `$env` and `$lib`, so it runs inside Vite rather than
 * under tsx: `pnpm db:seed:photographs` (scripts/seed-photographs.mjs).
 */
import { inArray, like, or, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { exifTiff, type ExifOptions } from '$lib/testing/exifJpeg';
import type { ImageSetData } from '$lib/validation/imageSet';
import { db } from '.';
import { image, imageSet, imageSetContact, user } from './schema';
import { encodePng, encodeWebp, paint, type Scene } from './demoPhotos';
import { submissionPrefix } from '../drafts';
import { imageKeys } from '../imageKeys';
import { createImageSet } from '../imageSets';
import { deleteImageObjects, finalizeImage, type UploadOwner } from '../imageUploads';
import { isLocalStore, putObject } from '../scans';
import type { Actor } from '../artefacts';

/** Every demo photograph's file name starts with this: how a re-run finds the last run's. */
const DEMO_PREFIX = 'demo-';

/** The test accounts `db:seed` creates (see ./seed). */
const ADMIN = 'seed-admin';
const CONTRIBUTOR = 'seed-contributor';

/** The anonymous submission's draft id: 22 base64url characters, as a real draft's (see ../drafts). */
const DEMO_DRAFT = 'demo-photographs-draft';

/** Where the demo photographs were "taken": the garden's neighbourhood. */
const GARDEN = { lat: 38.9157, lon: -77.0219 };

const CAMERAS = [
	{ make: 'FUJIFILM', model: 'X100V', fNumber: [2, 1], exposureTime: [1, 250], iso: 160 },
	{ make: 'Apple', model: 'iPhone 15', fNumber: [16, 10], exposureTime: [1, 120], iso: 64 }
] satisfies Partial<ExifOptions>[];

type DemoPhoto = Scene & {
	/** Wall-clock capture time `YYYY-MM-DD HH:MM`, or omitted for a photograph with no EXIF date. */
	taken?: string;
	camera?: number;
	/** Include GPS, as phones do, to show it stays private. */
	gps?: boolean;
};

type DemoSet = {
	who: 'admin' | 'contributor' | 'anonymous';
	description: string;
	/** Index into the events picked for the demo (see `pickEvents`); omitted for no event. */
	event?: number;
	photos: (event: EventDate | null) => DemoPhoto[];
	contact?: { name: string; email: string };
};

type EventDate = { title: string; date: string };

/** `day` plus `n` days, as `YYYY-MM-DD`. */
function addDays(day: string, n: number): string {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** A day to date photographs on when the set has no event: a spring weekend. */
const SPRING_DAY = '2026-05-16';

const SETS: DemoSet[] = [
	{
		who: 'admin',
		event: 0,
		description:
			'An evening in the garden, from setting up the tables to the last light over the beds.',
		photos: (e) => {
			const day = e?.date ?? SPRING_DAY;
			return [
				{ palette: 'midday', seed: 11, taken: `${day} 17:42`, camera: 0, gps: true },
				{
					palette: 'midday',
					seed: 12,
					taken: `${day} 18:05`,
					camera: 0,
					gps: true,
					portrait: true
				},
				{ palette: 'dawn', seed: 13, taken: `${day} 18:31`, camera: 0, gps: true },
				{ palette: 'dusk', seed: 14, taken: `${day} 19:12`, camera: 0, gps: true },
				{ palette: 'dusk', seed: 15, taken: `${day} 19:40`, camera: 0, gps: true, portrait: true }
			];
		}
	},
	{
		who: 'admin',
		event: 1,
		description: '',
		photos: (e) => [
			{
				palette: 'overcast',
				seed: 21,
				taken: `${e?.date ?? SPRING_DAY} 10:15`,
				camera: 1,
				gps: true
			}
		]
	},
	{
		who: 'admin',
		description:
			'Spring planting weekend.\nSaturday we turned the beds; Sunday the seedlings went in before the rain.',
		photos: () => [
			{ palette: 'dawn', seed: 31, taken: `${SPRING_DAY} 07:58`, camera: 1, gps: true },
			{ palette: 'midday', seed: 32, taken: `${SPRING_DAY} 12:20`, camera: 1, gps: true },
			{ palette: 'overcast', seed: 33, taken: `${addDays(SPRING_DAY, 1)} 09:47`, camera: 1 }
		]
	},
	{
		who: 'admin',
		event: 2,
		description: 'Scanned from prints found in the shed — no dates on them.',
		photos: () => [
			{ palette: 'night', seed: 41 },
			{ palette: 'dusk', seed: 42, portrait: true }
		]
	},
	{
		who: 'contributor',
		event: 3,
		description: 'A few from the back of the crowd.',
		photos: (e) => {
			const day = e?.date ?? SPRING_DAY;
			return [
				{ palette: 'dusk', seed: 51, taken: `${day} 20:02`, camera: 1, gps: true },
				{ palette: 'night', seed: 52, taken: `${day} 20:47`, camera: 1, gps: true },
				{ palette: 'night', seed: 53, taken: `${day} 21:10`, camera: 1, gps: true, portrait: true }
			];
		}
	},
	{
		who: 'anonymous',
		description: 'Walking past on my way home and had to stop.',
		contact: { name: 'Demo Visitor', email: 'visitor@example.com' },
		photos: () => [
			{ palette: 'dawn', seed: 61, taken: `${addDays(SPRING_DAY, 9)} 06:51`, camera: 1, gps: true },
			{
				palette: 'midday',
				seed: 62,
				taken: `${addDays(SPRING_DAY, 9)} 07:03`,
				camera: 1,
				gps: true
			}
		]
	}
];

/** `YYYY-MM-DD HH:MM` as EXIF writes a date: `YYYY:MM:DD HH:MM:SS`. */
const exifDate = (taken: string) => `${taken.replaceAll('-', ':')}:00`;

/** The EXIF block a camera would have written for `photo`; none when it records no date. */
function exifFor(photo: DemoPhoto): Uint8Array | undefined {
	if (!photo.taken) return undefined;
	const date = exifDate(photo.taken);
	return exifTiff({
		...CAMERAS[photo.camera ?? 0],
		dateTimeOriginal: date,
		createDate: date,
		// Summer time in the garden's time zone.
		offsetTimeOriginal: '-04:00',
		gps: photo.gps ? GARDEN : undefined
	});
}

/**
 * Vetted events to hang the demo sets on, most recent first. Only titles no
 * other event shares and only full dates: a set names its event by title
 * (see `resolveEventId`), and the photographs are dated on the event's day.
 */
async function pickEvents(count: number): Promise<EventDate[]> {
	return db.all<EventDate>(sql`
		SELECT title, date FROM event
		WHERE proposed_addition = 0 AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
		  AND title IN (SELECT title FROM event GROUP BY title HAVING count(*) = 1)
		ORDER BY date DESC LIMIT ${count}`);
}

/** Remove the sets (and any stray photographs) a previous run seeded. */
async function clearPreviousRun(): Promise<number> {
	const isDemo = like(image.originalName, `${DEMO_PREFIX}%`);
	const demo = await db.select({ setId: image.setId }).from(image).where(isDemo);
	const setIds = [...new Set(demo.map((row) => row.setId).filter((id) => id !== null))];

	// Every photograph in those sets, plus demo photographs never attached to one.
	const doomedRows = or(setIds.length ? inArray(image.setId, setIds) : undefined, isDemo);
	const doomed = await db
		.select({ url: image.url, originalUrl: image.originalUrl })
		.from(image)
		.where(doomedRows);

	// Children before parents, as seed-core clears them.
	await db.delete(image).where(doomedRows);
	if (setIds.length) {
		await db.delete(imageSetContact).where(inArray(imageSetContact.setId, setIds));
		await db.delete(imageSet).where(inArray(imageSet.id, setIds));
	}
	// Usually already gone (the store is fresh each boot); a hand re-run leaves them otherwise.
	await deleteImageObjects(doomed);
	return setIds.length;
}

/** Upload one photograph's two objects and finalize it, as the browser and /api/images/finalize do. */
async function upload(photo: DemoPhoto, name: string, owner: UploadOwner): Promise<number> {
	const pixels = paint(photo);
	const keys = imageKeys(owner.kind === 'keeper' ? '' : owner.prefix, 'image/png');
	await putObject(keys.originalKey, encodePng(pixels, exifFor(photo)), 'image/png');
	await putObject(keys.displayKey, await encodeWebp(pixels), 'image/webp');
	const finalized = await finalizeImage({ ...keys, name }, owner);
	return finalized.id;
}

function whoIs(who: DemoSet['who']): { actor: Actor; owner: UploadOwner } {
	if (who === 'anonymous') {
		return {
			actor: { userId: null, role: null },
			owner: { kind: 'draft', prefix: submissionPrefix(DEMO_DRAFT) }
		};
	}
	const userId = who === 'admin' ? ADMIN : CONTRIBUTOR;
	return {
		actor: { userId, role: who === 'admin' ? 'admin' : 'contributor' },
		owner: { kind: 'keeper', userId }
	};
}

export async function seedPhotographs(): Promise<void> {
	const url = env.DATABASE_URL ?? '';
	if (url.startsWith('libsql://') || url.startsWith('https://')) {
		throw new Error(`Refusing to seed photographs into a remote database (${url}). Local-only.`);
	}
	if (!isLocalStore()) {
		throw new Error('Refusing to seed photographs: S3_ENDPOINT is unset, so storage is not local.');
	}

	const accounts = await db
		.select({ id: user.id })
		.from(user)
		.where(inArray(user.id, [ADMIN, CONTRIBUTOR]));
	if (accounts.length < 2) {
		throw new Error('The test accounts are missing — run `pnpm db:setup:local` first.');
	}

	const cleared = await clearPreviousRun();
	if (cleared) console.log(`[seed-photographs] removed ${cleared} set(s) from a previous run`);

	const events = await pickEvents(4);
	let photoCount = 0;
	for (const [i, set] of SETS.entries()) {
		const event = set.event === undefined ? null : (events[set.event] ?? null);
		const { actor, owner } = whoIs(set.who);

		const imageIds: number[] = [];
		for (const [j, photo] of set.photos(event).entries()) {
			const name = `${DEMO_PREFIX}set${i + 1}-${String(j + 1).padStart(2, '0')}.png`;
			imageIds.push(await upload(photo, name, owner));
		}
		photoCount += imageIds.length;

		const data: ImageSetData = {
			description: set.description,
			event: event?.title ?? '',
			imageIds,
			date: null,
			dateAuto: true
		};
		const created = await createImageSet(data, actor, owner);
		if (!created.ok) throw new Error(`Demo set ${i + 1} was refused: ${created.message}`);

		if (set.contact) {
			await db.insert(imageSetContact).values({ setId: created.id, ...set.contact });
		}
	}

	const awaitingReview = SETS.filter((set) => set.who !== 'admin').length;
	console.log(
		`[seed-photographs] seeded ${SETS.length} image sets (${photoCount} photographs, ` +
			`${awaitingReview} awaiting review)`
	);
}
