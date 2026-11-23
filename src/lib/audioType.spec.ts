import { describe, expect, it } from 'vitest';
import {
	AIFF_REFUSAL,
	id3Length,
	sniffAudio,
	sniffAudioBytes,
	UNSUPPORTED_AUDIO
} from './audioType';

const bytes = (...parts: (string | number[])[]) =>
	new Uint8Array(
		parts.flatMap((part) =>
			typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part
		)
	);

/** An MPEG-1 Layer III frame header: 128 kbps, 44.1 kHz. */
const MP3_FRAME = [0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0];
/** An ADTS (AAC) frame header, 44.1 kHz. */
const ADTS_FRAME = [0xff, 0xf1, 0x50, 0x80, 0x02, 0x1f, 0xfc];

/** An ID3v2.4 tag header announcing a `body`-byte tag body. */
function id3Header(body: number, flags = 0): number[] {
	return [
		...'ID3'.split('').map((c) => c.charCodeAt(0)),
		4,
		0,
		flags,
		(body >> 21) & 0x7f,
		(body >> 14) & 0x7f,
		(body >> 7) & 0x7f,
		body & 0x7f
	];
}

describe('sniffAudioBytes', () => {
	it.each([
		['an MP3 frame', bytes(MP3_FRAME), 'audio/mpeg'],
		['an ADTS AAC frame', bytes(ADTS_FRAME), 'audio/aac'],
		['FLAC', bytes('fLaC', [0, 0, 0, 0x22]), 'audio/flac'],
		['Ogg', bytes('OggS', [0, 2, 0, 0]), 'audio/ogg'],
		['WAV', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '), 'audio/wav'],
		['an iTunes M4A', bytes([0, 0, 0, 0x20], 'ftypM4A ', [0, 0, 0, 0]), 'audio/mp4'],
		['an MP4 with a generic brand', bytes([0, 0, 0, 0x18], 'ftypmp42'), 'audio/mp4']
	])('knows %s', async (_, file, type) => {
		expect(await sniffAudioBytes(file)).toEqual({ type });
	});

	it('steps over an ID3 tag, and the zero padding after it, to the audio behind', async () => {
		const tagged = bytes(id3Header(20), Array(20).fill(0), [0, 0, 0], MP3_FRAME);
		expect(await sniffAudioBytes(tagged)).toEqual({ type: 'audio/mpeg' });
		const flac = bytes(id3Header(4), [1, 2, 3, 4], 'fLaC');
		expect(await sniffAudioBytes(flac)).toEqual({ type: 'audio/flac' });
	});

	it('counts an ID3 footer in the tag’s length', () => {
		expect(id3Length(bytes(id3Header(100)))).toBe(110);
		expect(id3Length(bytes(id3Header(100, 0x10)))).toBe(120);
		// A size byte with its top bit set is not syncsafe: not a tag.
		expect(id3Length(bytes('ID3', [4, 0, 0, 0x80, 0, 0, 0]))).toBeNull();
	});

	it('reads past a tag larger than the first window, by a second ranged read', async () => {
		const tag = 64 * 1024; // cover art
		const file = new Uint8Array(10 + tag + MP3_FRAME.length);
		file.set(id3Header(tag));
		file.set(MP3_FRAME, 10 + tag);
		const reads: number[] = [];
		const result = await sniffAudio(async (start, length) => {
			reads.push(start);
			return file.subarray(start, start + length);
		});
		expect(result).toEqual({ type: 'audio/mpeg' });
		expect(reads).toEqual([0, 10 + tag]);
	});

	it('refuses AIFF by name, since only Safari plays it', async () => {
		expect(await sniffAudioBytes(bytes('FORM', [0, 0, 0, 0], 'AIFF'))).toEqual({
			refused: AIFF_REFUSAL
		});
	});

	it.each([
		['a PNG', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a])],
		['a PDF', bytes('%PDF-1.7')],
		['a HEIC photo', bytes([0, 0, 0, 0x18], 'ftypheic')],
		['an MPEG sync with a reserved layer', bytes([0xff, 0xe0, 0x90, 0x64])],
		['an MPEG sync with a bad bitrate', bytes([0xff, 0xfb, 0xf0, 0x64])],
		['nothing at all', new Uint8Array(0)],
		['a tag with nothing after it', bytes(id3Header(4), [0, 0, 0, 0])]
	])('refuses %s', async (_, file) => {
		expect(await sniffAudioBytes(file)).toEqual({ refused: UNSUPPORTED_AUDIO });
	});
});
