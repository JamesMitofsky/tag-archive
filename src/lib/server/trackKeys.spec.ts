import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ BETTER_AUTH_SECRET: 'test-secret' }));
const { isTrackKey, parseTrackKey, trackKey, trackTicket, verifyTrackTicket } =
	await import('./trackKeys');

describe('track keys', () => {
	it('lays a track out as tracks/<uuid>.<ext>, its type readable from the key', () => {
		const key = trackKey('audio/flac', '0b5d7c1e-2f3a-4b6c-8d9e-0a1b2c3d4e5f');
		expect(key).toBe('tracks/0b5d7c1e-2f3a-4b6c-8d9e-0a1b2c3d4e5f.flac');
		expect(parseTrackKey(key)).toEqual({ key, type: 'audio/flac' });
		expect(isTrackKey(key)).toBe(true);
	});

	it.each([
		'tracks/../images/0b5d7c1e-2f3a-4b6c-8d9e-0a1b2c3d4e5f.mp3',
		'tracks/0b5d7c1e-2f3a-4b6c-8d9e-0a1b2c3d4e5f.exe',
		'submissions/AAAAAAAAAAAAAAAAAAAAAA/tracks/0b5d7c1e-2f3a-4b6c-8d9e-0a1b2c3d4e5f.mp3',
		'tracks/NOT-A-UUID.mp3',
		42
	])('refuses %s', (key) => {
		expect(parseTrackKey(key)).toBeNull();
	});

	it('binds a ticket to both the keeper and the key', () => {
		const key = trackKey('audio/mpeg');
		const ticket = trackTicket('keeper-1', key);
		expect(verifyTrackTicket('keeper-1', key, ticket)).toBe(true);
		expect(verifyTrackTicket('keeper-2', key, ticket)).toBe(false);
		expect(verifyTrackTicket('keeper-1', trackKey('audio/mpeg'), ticket)).toBe(false);
		expect(verifyTrackTicket('keeper-1', key, undefined)).toBe(false);
	});
});
