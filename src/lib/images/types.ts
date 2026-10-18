/**
 * Image-set shapes shared by the server, the uploader and the pages. Kept free
 * of server imports so the browser bundle can use them.
 */

/**
 * One photograph as the public dataset publishes it. A whitelist, built field
 * by field (see `loadPublicDataset`): the original file, its metadata and its
 * exact capture time can carry GPS and device details, so none of them ride
 * along.
 */
export type PublicImage = {
	id: number;
	/** The WebP display copy. */
	url: string;
	width: number;
	height: number;
	/** The day the photograph was taken (`YYYY-MM-DD`), or null when unknown. */
	capturedDate: string | null;
};

/** One vetted image set as the public pages read it. */
export type PublicImageSet = {
	id: number;
	description: string | null;
	/** The linked event's title, only when that event is itself vetted. */
	event: string | null;
	/** A partial date (see $lib/partialDate), null when undated. */
	date: string | null;
	/** In display order. */
	images: PublicImage[];
};

/**
 * An uploaded photograph as the finalize endpoint hands it back, and as the
 * uploader seeds already-attached images on the edit page. `id` is what a form
 * submits to attach it to a set.
 */
export type UploadedImage = {
	id: number;
	/** The WebP display copy. */
	url: string;
	/** The original, exactly as uploaded. */
	originalUrl: string;
	width: number;
	height: number;
	/** Wall-clock capture time `YYYY-MM-DDTHH:MM:SS`, or null when unknown. */
	capturedAt: string | null;
};

/** A presigned (or, in local dev, proxied) PUT the browser makes straight to storage. */
export type PresignedPut = {
	url: string;
	/** Headers the PUT must carry exactly as given: they are part of the signature. */
	headers: Record<string, string>;
};

/** `POST /api/images/upload-url` body asking to upload an original. */
export type OriginalUploadRequest = {
	object: 'original';
	/** The original's type, as the browser sniffed it from the file's bytes. */
	type: string;
	/** The original's exact size in bytes; the PUT must carry exactly this many. */
	size: number;
	/** The file name the device gave it. */
	name: string;
};

/** `POST /api/images/upload-url` body asking to upload the display copy of an original. */
export type DisplayUploadRequest = {
	object: 'display';
	/** The `originalKey` an original upload was issued under. */
	originalKey: string;
	/** The `ticket` issued with that original, proving this caller was issued it. */
	ticket: string;
	/** The WebP's exact size in bytes; the PUT must carry exactly this many. */
	size: number;
};

/** Answer to an original upload request. */
export type OriginalUploadGrant = {
	originalKey: string;
	displayKey: string;
	/** Presents the display upload request for this original (see `DisplayUploadRequest`). */
	ticket: string;
	upload: PresignedPut;
};

/** Answer to a display upload request. */
export type DisplayUploadGrant = { upload: PresignedPut };

/** `POST /api/images/finalize` body. */
export type FinalizeRequest = {
	originalKey: string;
	displayKey: string;
	/** The file name the device gave the original. */
	name: string;
};
