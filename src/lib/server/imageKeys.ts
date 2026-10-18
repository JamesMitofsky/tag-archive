import { randomUUID } from 'node:crypto';
import type { ImageType } from '$lib/imageType';
import { sign } from './signing';

/**
 * Bucket key layout for photographs. Each image's two objects get a folder
 * each:
 *
 *   <prefix>images/<uuid>/original.<ext>          the upload, bit-for-bit
 *   <prefix>images/<display id>/display.webp      the WebP display copy
 *
 * `prefix` is '' for a signed-in keeper and `submissions/<draft>/` for an
 * anonymous contributor (see $lib/server/drafts), so ownership is readable from
 * either key itself. `<display id>` is a keyed hash of `<uuid>` (see
 * `displayFolderId`): the display copy is published and the bucket is public,
 * so were the two in one folder, anyone could swap `display.webp` for
 * `original.jpg` and read the original's GPS position and device details.
 * Separate folders also keep the pair from colliding when the original is
 * itself a WebP, and every key stays plain (see `isPlainKey` in ./scans).
 *
 * Keys come back from the browser at finalize time, so `parseImageKeys` is
 * strict: anything that isn't exactly this layout is refused.
 */

/** File extension per stored original type. Mirrors `extensionFor` in ./scans. */
const EXTENSIONS: Record<ImageType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic'
};
const TYPE_BY_EXTENSION = Object.fromEntries(
	Object.entries(EXTENSIONS).map(([type, ext]) => [ext, type as ImageType])
) as Record<string, ImageType>;

export type ImageKeys = { originalKey: string; displayKey: string };

export type ParsedImageKeys = ImageKeys & {
	/** '' or `submissions/<draft>/`. */
	prefix: string;
	/** The original's folder id. */
	uuid: string;
	/** The original's type, as its key's extension names it. */
	originalType: ImageType;
};

/**
 * The display copy's folder for the original in folder `uuid`: 16 bytes of an
 * HMAC over it, which only the server can compute, and which can't be turned
 * back into `uuid`. Written in a uuid's shape (lowercase hex, 8-4-4-4-12), so
 * it passes every check a uuid folder does, the sweeps' included. Rows store
 * both URLs, so rotating the secret only strands uploads still in flight, as
 * it does their tickets.
 */
function displayFolderId(uuid: string): string {
	const hex = Buffer.from(sign('image-display-folder', uuid), 'base64url')
		.subarray(0, 16)
		.toString('hex');
	return hex.replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}

const displayKeyFor = (prefix: string, uuid: string) =>
	`${prefix}images/${displayFolderId(uuid)}/display.webp`;

/** Fresh keys for one image under `prefix`, its original stored as `type`. */
export function imageKeys(prefix: string, type: ImageType, uuid: string = randomUUID()): ImageKeys {
	return {
		originalKey: `${prefix}images/${uuid}/original.${EXTENSIONS[type]}`,
		displayKey: displayKeyFor(prefix, uuid)
	};
}

// Draft ids are 22 base64url characters (see $lib/server/drafts); uuids are
// lowercase RFC 4122 as `crypto.randomUUID()` writes them.
const ORIGINAL_KEY_RE =
	/^((?:submissions\/[A-Za-z0-9_-]{22}\/)?)images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/original\.(jpg|png|webp|gif|heic)$/;

/**
 * Validate a pair of keys handed back by the browser: the original must match
 * the layout above exactly, and the display key must be the one derived from
 * it. Null for anything else.
 */
export function parseImageKeys(keys: {
	originalKey: unknown;
	displayKey: unknown;
}): ParsedImageKeys | null {
	const { originalKey, displayKey } = keys;
	if (typeof originalKey !== 'string' || typeof displayKey !== 'string') return null;
	const match = ORIGINAL_KEY_RE.exec(originalKey);
	if (!match) return null;
	const [, prefix, uuid, extension] = match;
	if (displayKey !== displayKeyFor(prefix, uuid)) return null;
	return { originalKey, displayKey, prefix, uuid, originalType: TYPE_BY_EXTENSION[extension] };
}

/** `parseImageKeys` for an original key alone: its display key is derived. */
export function parseOriginalKey(originalKey: unknown): ParsedImageKeys | null {
	if (typeof originalKey !== 'string') return null;
	const match = ORIGINAL_KEY_RE.exec(originalKey);
	if (!match) return null;
	return parseImageKeys({ originalKey, displayKey: displayKeyFor(match[1], match[2]) });
}
