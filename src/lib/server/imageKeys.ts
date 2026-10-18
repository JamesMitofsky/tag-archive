import { randomUUID } from 'node:crypto';
import type { ImageType } from '$lib/imageType';

/**
 * Bucket key layout for photographs. Each image gets its own folder holding
 * exactly two objects:
 *
 *   <prefix>images/<uuid>/original.<ext>   the upload, bit-for-bit
 *   <prefix>images/<uuid>/display.webp     the WebP display copy
 *
 * `prefix` is '' for a signed-in keeper and `submissions/<draft>/` for an
 * anonymous contributor (see $lib/server/drafts), so ownership is readable from
 * the key itself. A folder per image, rather than two sibling files, keeps the
 * pair from colliding when the original is itself a WebP, and keeps every key
 * free of anything `keyFromUrl` would refuse.
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
	/** The per-image folder's id. */
	uuid: string;
	/** The original's type, as its key's extension names it. */
	originalType: ImageType;
};

/** Fresh keys for one image under `prefix`, its original stored as `type`. */
export function imageKeys(prefix: string, type: ImageType, uuid: string = randomUUID()): ImageKeys {
	const folder = `${prefix}images/${uuid}/`;
	return {
		originalKey: `${folder}original.${EXTENSIONS[type]}`,
		displayKey: `${folder}display.webp`
	};
}

// Draft ids are 22 base64url characters (see $lib/server/drafts); uuids are
// lowercase RFC 4122 as `crypto.randomUUID()` writes them.
const ORIGINAL_KEY_RE =
	/^((?:submissions\/[A-Za-z0-9_-]{22}\/)?)images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/original\.(jpg|png|webp|gif|heic)$/;

/**
 * Validate a pair of keys handed back by the browser: the original must match
 * the layout above exactly, and the display key must be its own folder's
 * `display.webp`. Null for anything else.
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
	if (displayKey !== `${prefix}images/${uuid}/display.webp`) return null;
	return { originalKey, displayKey, prefix, uuid, originalType: TYPE_BY_EXTENSION[extension] };
}

/** `parseImageKeys` for an original key alone: its display sibling is implied. */
export function parseOriginalKey(originalKey: unknown): ParsedImageKeys | null {
	if (typeof originalKey !== 'string') return null;
	const match = ORIGINAL_KEY_RE.exec(originalKey);
	if (!match) return null;
	return parseImageKeys({ originalKey, displayKey: `${match[1]}images/${match[2]}/display.webp` });
}
