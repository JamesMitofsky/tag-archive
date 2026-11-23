/**
 * Identify an uploaded track by its bytes, never by the name or the type the
 * browser guessed. The bucket serves each object publicly with the type it was
 * stored under, and that type is signed into the upload URL, so the bytes on
 * the public host are always served as audio. Sniffing on top of that keeps a
 * file that isn't actually audio (a PDF of liner notes picked by mistake, a
 * zip of the album) out of an album, where the player would only fail on it.
 *
 * The types are what the album player can play in current browsers: MP3, AAC
 * (raw ADTS, or in an MP4/M4A box), FLAC, WAV and Ogg (Vorbis or Opus). AIFF
 * is refused on purpose, by name, because only Safari plays it.
 *
 * Pure, so the browser runs it too: the uploader sniffs a picked file to
 * declare its type before asking for an upload URL. That declaration is only a
 * request; the server sniffs what actually landed and refuses a mismatch (see
 * #lib/server/trackUploads).
 */
export const AUDIO_TYPES = [
	'audio/mpeg',
	'audio/mp4',
	'audio/aac',
	'audio/flac',
	'audio/wav',
	'audio/ogg'
] as const;

export type AudioType = (typeof AUDIO_TYPES)[number];

/** File extension each sniffed type is stored under. */
export const AUDIO_EXTENSIONS: Record<AudioType, string> = {
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'audio/aac': 'aac',
	'audio/flac': 'flac',
	'audio/wav': 'wav',
	'audio/ogg': 'ogg'
};

/** The names people know each format by, for messages and the keeper pages. */
export const AUDIO_TYPE_NAMES: Record<AudioType, string> = {
	'audio/mpeg': 'MP3',
	'audio/mp4': 'M4A',
	'audio/aac': 'AAC',
	'audio/flac': 'FLAC',
	'audio/wav': 'WAV',
	'audio/ogg': 'Ogg'
};

/** What the file picker offers. A hint only: the bytes decide. */
export const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus';

/** Refusal for a file whose bytes aren't one of the formats above. */
export const UNSUPPORTED_AUDIO = 'Not an MP3, M4A, AAC, FLAC, WAV or Ogg audio file';

/** Refusal for AIFF in particular, which looks like audio but plays almost nowhere. */
export const AIFF_REFUSAL = 'AIFF files only play in Safari. Convert it to WAV or FLAC first';

export function isAudioType(value: unknown): value is AudioType {
	return (AUDIO_TYPES as readonly unknown[]).includes(value);
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * ISO-BMFF major brands that mean an audio file in an MP4 box. Phones and
 * iTunes write `M4A `; encoders that aren't Apple's often write a generic
 * brand. A generic brand can also be a video, which the player then plays the
 * sound of: harmless, and no worse than refusing someone's real M4A.
 */
const MP4_AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'mp41', 'mp42', 'isom', 'iso2', 'iso5', 'dash']);

/**
 * An MPEG audio frame header (MP3 and its MPEG-1/2 Layer I/II cousins) at
 * `at`: the 11-bit sync, then a version, layer, bitrate and sample rate that
 * are each not the reserved value. Checking those as well as the sync keeps
 * a stray 0xFFE in some other file from passing as audio.
 */
function isMpegFrame(bytes: Uint8Array, at: number): boolean {
	if (at + 4 > bytes.length) return false;
	const [b0, b1, b2] = [bytes[at], bytes[at + 1], bytes[at + 2]];
	if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return false;
	const version = (b1 >> 3) & 0b11;
	const layer = (b1 >> 1) & 0b11;
	const bitrate = b2 >> 4;
	const sampleRate = (b2 >> 2) & 0b11;
	return version !== 0b01 && layer !== 0b00 && bitrate !== 0b1111 && sampleRate !== 0b11;
}

/** An ADTS frame header (raw AAC) at `at`: the 12-bit sync, layer 0, a known sample rate. */
function isAdtsFrame(bytes: Uint8Array, at: number): boolean {
	if (at + 4 > bytes.length) return false;
	const [b0, b1, b2] = [bytes[at], bytes[at + 1], bytes[at + 2]];
	if (b0 !== 0xff || (b1 & 0xf6) !== 0xf0) return false;
	return ((b2 >> 2) & 0b1111) <= 12;
}

/**
 * The length of the ID3v2 tag at the start of `bytes` (header, body and any
 * footer), or null when there is none. ID3v2 sits in front of the audio in
 * most MP3s and some AAC and FLAC files, and can run to megabytes when it
 * carries cover art, so the audio has to be looked for after it.
 */
export function id3Length(bytes: Uint8Array): number | null {
	if (bytes.length < 10 || ascii(bytes, 0, 3) !== 'ID3') return null;
	const size = bytes.subarray(6, 10);
	// The size is "syncsafe": seven bits per byte, the top bit always clear.
	if (size.some((byte) => byte & 0x80)) return null;
	const body = (size[0] << 21) | (size[1] << 14) | (size[2] << 7) | size[3];
	const footer = bytes[5] & 0x10 ? 10 : 0;
	return 10 + body + footer;
}

/**
 * What the bytes at the start of `bytes` say the file is: a type, `'aiff'`
 * for AIFF (refused, but by name), or null.
 */
function sniffAt(bytes: Uint8Array, at: number): AudioType | 'aiff' | null {
	const rest = bytes.subarray(at);
	if (rest.length >= 4 && ascii(rest, 0, 4) === 'fLaC') return 'audio/flac';
	if (rest.length >= 4 && ascii(rest, 0, 4) === 'OggS') return 'audio/ogg';
	if (rest.length >= 12 && ascii(rest, 0, 4) === 'RIFF' && ascii(rest, 8, 4) === 'WAVE') {
		return 'audio/wav';
	}
	if (rest.length >= 12 && ascii(rest, 0, 4) === 'FORM') {
		const form = ascii(rest, 8, 4);
		if (form === 'AIFF' || form === 'AIFC') return 'aiff';
	}
	if (
		rest.length >= 12 &&
		ascii(rest, 4, 4) === 'ftyp' &&
		MP4_AUDIO_BRANDS.has(ascii(rest, 8, 4))
	) {
		return 'audio/mp4';
	}
	if (isAdtsFrame(rest, 0)) return 'audio/aac';
	if (isMpegFrame(rest, 0)) return 'audio/mpeg';
	return null;
}

/** Bytes read from the start of a file (and again after each ID3 tag) to sniff it. */
export const SNIFF_WINDOW = 4096;

/** At most this many ID3 tags are stepped over; a file stacking more is not one we take. */
const MAX_ID3_TAGS = 4;

/** Reads `length` bytes of a file from `start` (fewer at its end). */
export type ReadRange = (start: number, length: number) => Promise<Uint8Array>;

/** The outcome of sniffing a track. */
export type AudioSniff = { type: AudioType } | { refused: string };

/**
 * Sniff a track through `read`, which the browser backs with `File.slice`
 * and the server with ranged reads from the bucket, so a large file is never
 * read whole. Steps over any ID3v2 tags (and the zero padding some encoders
 * leave after one) to the audio behind them.
 */
export async function sniffAudio(read: ReadRange): Promise<AudioSniff> {
	let offset = 0;
	for (let tags = 0; tags <= MAX_ID3_TAGS; tags++) {
		const window = await read(offset, SNIFF_WINDOW);
		const tag = id3Length(window);
		if (tag !== null) {
			offset += tag;
			continue;
		}
		// Padding after a tag: skip zeros within the window, no further.
		let at = 0;
		if (offset > 0) while (at < window.length && window[at] === 0) at++;
		const found = sniffAt(window, at);
		if (found === 'aiff') return { refused: AIFF_REFUSAL };
		return found ? { type: found } : { refused: UNSUPPORTED_AUDIO };
	}
	return { refused: UNSUPPORTED_AUDIO };
}

/** `sniffAudio` over bytes already in memory. */
export function sniffAudioBytes(bytes: Uint8Array): Promise<AudioSniff> {
	return sniffAudio(async (start, length) => bytes.subarray(start, start + length));
}
