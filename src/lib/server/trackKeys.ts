import { randomUUID } from 'node:crypto';
import { AUDIO_EXTENSIONS, type AudioType } from '#lib/audioType.ts';
import { sign, verify } from './signing';

/**
 * Bucket key layout for album tracks: one object per track,
 *
 *   tracks/<uuid>.<ext>
 *
 * at the bucket root, since only signed-in keepers upload them. The
 * extension names the type the upload URL was signed for, so finalize can
 * tell what the uploader asked to store from the key alone. Keys come back
 * from the browser at finalize time, so `parseTrackKey` is strict: anything
 * that isn't exactly this layout is refused.
 */

const TYPE_BY_EXTENSION = Object.fromEntries(
	Object.entries(AUDIO_EXTENSIONS).map(([type, ext]) => [ext, type as AudioType])
) as Record<string, AudioType>;

const TRACK_KEY_RE = new RegExp(
	`^tracks/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\.(${Object.values(
		AUDIO_EXTENSIONS
	).join('|')})$`
);

/** A fresh key for one track stored as `type`. */
export function trackKey(type: AudioType, uuid: string = randomUUID()): string {
	return `tracks/${uuid}.${AUDIO_EXTENSIONS[type]}`;
}

/** Whether `key` is a track key, as the sweeps judge what they may delete. */
export function isTrackKey(key: string): boolean {
	return TRACK_KEY_RE.test(key);
}

/** A key handed back by the browser, with the type its extension names; null for anything else. */
export function parseTrackKey(key: unknown): { key: string; type: AudioType } | null {
	if (typeof key !== 'string') return null;
	const match = TRACK_KEY_RE.exec(key);
	return match ? { key, type: TYPE_BY_EXTENSION[match[2]] } : null;
}

const ticketPayload = (userId: string, key: string) => `${userId}\n${key}`;

/**
 * Proof that `key` was issued to `userId`, handed out with its upload URL.
 * Every keeper uploads at the bucket root, so the key alone can't say whose
 * it is: without this, one keeper could finalize another's upload in flight
 * and have it recorded as their own.
 */
export function trackTicket(userId: string, key: string): string {
	return sign('track-upload', ticketPayload(userId, key));
}

export function verifyTrackTicket(userId: string, key: string, ticket: unknown): boolean {
	return typeof ticket === 'string' && verify('track-upload', ticketPayload(userId, key), ticket);
}
