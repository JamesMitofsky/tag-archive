import { MAX_TRACK_TITLE, MAX_TRACKS_PER_ALBUM } from '#lib/albums/limits.ts';
import { readDateField } from '#lib/partialDate.ts';
import { check, defineSuite, isPartialDate, maxLen, optionalId, str } from './helpers';

export { MAX_TRACKS_PER_ALBUM } from '#lib/albums/limits.ts';

/** One track as a form submits it: an uploaded track's id and the title to give it. */
export type AlbumTrackInput = { id: number; title: string };

/** Normalized album form values — validated, then used for the DB write. */
export type AlbumData = {
	title: string;
	artist: string;
	description: string;
	event: string;
	/** The event occurrence the field settled on (see `ArtefactData.eventId`). */
	eventId: number | null;
	/** A partial date, null when deliberately undated, '' when not chosen yet. */
	date: string | null;
	/** In play order. */
	tracks: AlbumTrackInput[];
};

/**
 * Read an album create/edit form. Shared by the actions and `use:enhance`.
 *
 * Tracks arrive as two parallel lists, `trackIds` and `trackTitles`, which
 * the uploader writes row by row, so the nth title belongs to the nth id.
 * Should the lists ever differ in length, the short one is padded with values
 * the suite refuses (a NaN id, an empty title) rather than pairing a title
 * with the wrong track. Ids that aren't numbers parse to NaN, for the same.
 */
export function parseAlbumForm(fd: FormData): AlbumData {
	const ids = fd
		.getAll('trackIds')
		.map((value) => String(value).trim())
		.map((value) => (/^\d+$/.test(value) ? Number(value) : NaN));
	const titles = fd.getAll('trackTitles').map((value) => String(value).trim());
	const count = Math.max(ids.length, titles.length);
	return {
		title: str(fd.get('title')),
		artist: str(fd.get('artist')),
		description: str(fd.get('description')),
		event: str(fd.get('event')),
		eventId: optionalId(fd.get('eventId')),
		date: readDateField(str(fd.get('date'))),
		tracks: Array.from({ length: count }, (_, i) => ({
			id: ids[i] ?? NaN,
			title: titles[i] ?? ''
		}))
	};
}

/** Whether a membership is 1..MAX distinct positive integer ids. */
export function isTrackMembership(ids: number[]): boolean {
	return (
		ids.length >= 1 &&
		ids.length <= MAX_TRACKS_PER_ALBUM &&
		ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
		new Set(ids).size === ids.length
	);
}

export function createAlbumSuite() {
	return defineSuite<AlbumData>((data) => {
		const title = data.title ?? '';
		check('title', 'Title required', title.length > 0);
		check('title', 'Keep the title under 200 characters', title.length <= 200);

		maxLen('artist', data.artist ?? '', 200, 'artist');
		maxLen('description', data.description ?? '', 2000, 'description');
		maxLen('event', data.event ?? '', 200, 'event');

		// Same rules as an artefact's date: vague is fine, and undated is a choice.
		const date = data.date;
		check('date', 'Pick a date, or choose “No date”', date !== '');
		check('date', 'Pick a valid date', date === null || date === '' || isPartialDate(date));

		const tracks = data.tracks ?? [];
		check('tracks', 'Add at least one track', tracks.length >= 1);
		check(
			'tracks',
			`Add at most ${MAX_TRACKS_PER_ALBUM} tracks`,
			tracks.length <= MAX_TRACKS_PER_ALBUM
		);
		check(
			'tracks',
			'Those tracks could not be attached',
			tracks.length === 0 || isTrackMembership(tracks.map((t) => t.id))
		);
		check(
			'tracks',
			'Give every track a title',
			tracks.every((t) => t.title.length > 0)
		);
		check(
			'tracks',
			`Keep each track title under ${MAX_TRACK_TITLE} characters`,
			tracks.every((t) => Array.from(t.title).length <= MAX_TRACK_TITLE)
		);
	});
}

/**
 * Raw (unvalidated) values a failed submit echoes back. The tracks aren't
 * among them: the uploader keeps its own rows through an enhanced submit,
 * and a track it isn't showing must never be submitted unseen.
 */
export type AlbumFormValues = {
	title: string;
	artist: string;
	description: string;
	event: string;
	/** The picked occurrence's id, '' for none. */
	eventId: string;
	date: string;
};

export function echoAlbumForm(fd: FormData): AlbumFormValues {
	const value = (name: string) => String(fd.get(name) ?? '');
	return {
		title: value('title'),
		artist: value('artist'),
		description: value('description'),
		event: value('event'),
		eventId: value('eventId'),
		date: value('date')
	};
}
