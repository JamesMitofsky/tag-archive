/**
 * Upload limits for albums, shared by the uploader and the server, which is
 * the authority on every one of them.
 */

/**
 * The largest track accepted. A track goes straight from the browser to the
 * bucket (see #lib/server/trackUploads), so this is about what a keeper can
 * reasonably upload and the archive store, not a function's body limit: an
 * hour of CD-quality WAV is about 635 MB, so this takes a long live set
 * uncompressed and anything compressed with room to spare.
 */
export const MAX_TRACK_BYTES = 1024 * 1024 * 1024;

/** The most tracks one album may hold. */
export const MAX_TRACKS_PER_ALBUM = 100;

/** A measured duration past this (a day) is a bad reading, not a track, and is dropped. */
export const MAX_TRACK_SECONDS = 24 * 60 * 60;

/** Longest track title, in characters. */
export const MAX_TRACK_TITLE = 200;
