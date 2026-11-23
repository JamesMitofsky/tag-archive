/**
 * Album shapes shared by the server, the uploader and the pages. Kept free of
 * server imports so the browser bundle can use them.
 */
import type { AudioType } from '#lib/audioType.ts';
import type { PresignedPut } from '#lib/images/types.ts';

/**
 * One track as the public dataset publishes it. A whitelist, built field by
 * field (see `loadPublicDataset`): who uploaded it and the file name their
 * device gave it stay with the keepers.
 */
export type PublicTrack = {
	id: number;
	title: string;
	/** The audio file, exactly as uploaded. */
	url: string;
	/** Length in seconds as the uploader measured it, or null when unknown. */
	duration: number | null;
};

/** One vetted album as the public pages read it. */
export type PublicAlbum = {
	id: number;
	title: string;
	artist: string | null;
	description: string | null;
	/** The linked event's title, or null when unlinked. */
	event: string | null;
	/** A partial date (see #lib/partialDate), null when undated. */
	date: string | null;
	/** In play order. */
	tracks: PublicTrack[];
};

/**
 * An uploaded track as the finalize endpoint hands it back, and as the
 * uploader seeds already-attached tracks on the edit page. `id` is what a
 * form submits to attach it to an album.
 */
export type UploadedTrack = {
	id: number;
	title: string;
	url: string;
	type: AudioType;
	bytes: number;
	duration: number | null;
	originalName: string | null;
};

/** `POST /api/tracks/upload-url` body. */
export type TrackUploadRequest = {
	/** The type the browser sniffed from the file's bytes. */
	type: string;
	/** The file's exact size in bytes; the PUT must carry exactly this many. */
	size: number;
	/** The file name the device gave it. */
	name: string;
};

/** Answer to a track upload request. */
export type TrackUploadGrant = {
	key: string;
	/** Presents the finalize request for this key, proving it was issued to this keeper. */
	ticket: string;
	upload: PresignedPut;
};

/** `POST /api/tracks/finalize` body. */
export type TrackFinalizeRequest = {
	key: string;
	ticket: string;
	/** The file name the device gave it. */
	name: string;
	/** Seconds, as the browser measured it, or null. Cosmetic: kept only when plausible. */
	duration: number | null;
};
