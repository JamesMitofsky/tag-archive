import exifr from 'exifr';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
	concatBytes,
	exifHeic,
	exifJpeg,
	exifPng,
	exifTiff,
	exifWebp,
	iccProfile,
	IPTC_UTF8,
	iptcDataset,
	iptcSegment,
	jpegSegment,
	pngIccp,
	pngXmpText,
	xmpPacket,
	type ExifJpegOptions
} from '$lib/testing/exifJpeg';
import { MAX_METADATA_JSON_BYTES, parseImageMetadata } from './imageMetadata';

// exifr itself, recording what it is handed (its export can't be spied on in place).
const exifrInputs = vi.hoisted(() => [] as unknown[]);
vi.mock('exifr', async (importOriginal) => {
	const { default: actual } = await importOriginal<{ default: typeof exifr }>();
	const parse: typeof actual.parse = (input, options) => {
		exifrInputs.push(input);
		return actual.parse(input, options);
	};
	return { default: { ...actual, parse } };
});

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	exifrInputs.length = 0;
});
afterEach(() => {
	vi.restoreAllMocks();
});

const parse = (options: ExifJpegOptions) => parseImageMetadata(exifJpeg(options));

/** Every value in `value`, recursively. */
function* leaves(value: unknown): Generator<unknown> {
	yield value;
	if (value && typeof value === 'object') {
		for (const item of Object.values(value)) yield* leaves(item);
	}
}

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

const text = (value: string) => new TextEncoder().encode(value);

// TIFF field types.
const BYTE = 1;
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const UNDEFINED = 7;

/** An ICC profile whose `mluc` description claims billions of zero-size records. */
function hostileIcc(): Uint8Array {
	const icc = iccProfile({ description: 'Display P3', version: 4 });
	const mluc = Buffer.from(icc).indexOf('mluc');
	const view = new DataView(icc.buffer, icc.byteOffset);
	view.setUint32(mluc + 8, 0xffffffff); // record count
	view.setUint32(mluc + 12, 0); // record size
	return icc;
}

/** Fails the test if the process-wide built-ins were written to. */
function expectNoPollution() {
	expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	expect(Object.keys).toBeTypeOf('function');
}

/**
 * A little-endian TIFF block written field by field, for forgeries the
 * well-formed `exifTiff` can't express: IFD0 at offset 8 holding `entries`
 * as given (tag, type, count, value-or-offset), then `values` right after it.
 */
function forgedTiff(
	entries: [tag: number, type: number, count: number, value: number][],
	values = new Uint8Array(0)
) {
	const out = new Uint8Array(valuesAt(entries.length) + values.length);
	const view = new DataView(out.buffer);
	out.set([0x49, 0x49, 0x2a, 0x00]);
	view.setUint32(4, 8, true);
	view.setUint16(8, entries.length, true);
	entries.forEach(([tag, type, count, value], i) => {
		const at = 10 + 12 * i;
		view.setUint16(at, tag, true);
		view.setUint16(at + 2, type, true);
		view.setUint32(at + 4, count, true);
		view.setUint32(at + 8, value, true);
	});
	out.set(values, valuesAt(entries.length));
	return out;
}

/** Where `forgedTiff` puts its values: after the header, IFD0 and its next-IFD pointer. */
const valuesAt = (entryCount: number) => 8 + 2 + 12 * entryCount + 4;

/**
 * The value bytes a TIFF block's IFD0 entries claim beyond their own 4 bytes,
 * read as exifr would (little-endian, IFD0 only).
 */
function claimedValueBytes(tiff: Uint8Array): number {
	const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
	const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
	const ifd0 = view.getUint32(4, true);
	let total = 0;
	for (let i = 0; i < view.getUint16(ifd0, true); i++) {
		const at = ifd0 + 2 + 12 * i;
		const bytes = (sizes[view.getUint16(at + 2, true)] ?? 0) * view.getUint32(at + 4, true);
		if (bytes > 4) total += bytes;
	}
	return total;
}

describe('the test fixtures', () => {
	it('build EXIF that exifr itself reads, in either byte order', async () => {
		for (const bigEndian of [false, true]) {
			const output = await exifr.parse(
				exifJpeg({
					make: 'Canon',
					model: 'EOS R6',
					dateTimeOriginal: '2024:05:01 14:30:00',
					offsetTimeOriginal: '+02:00',
					fNumber: [28, 10],
					iso: 400,
					gps: { lat: 51.5007, lon: -0.1246 },
					bigEndian
				}),
				{ mergeOutput: false, reviveValues: false }
			);
			expect(output.ifd0).toMatchObject({ Make: 'Canon', Model: 'EOS R6' });
			expect(output.exif).toMatchObject({
				DateTimeOriginal: '2024:05:01 14:30:00',
				OffsetTimeOriginal: '+02:00',
				FNumber: 2.8,
				ISO: 400
			});
			expect(output.gps.latitude).toBeCloseTo(51.5007, 6);
			expect(output.gps.longitude).toBeCloseTo(-0.1246, 6);
		}
	});

	it('build HEIC and PNG containers exifr’s own readers accept', async () => {
		// Safe here: these fixtures carry no XMP or ICC for exifr's unsafe readers.
		const tiff = exifTiff({ make: 'Apple', dateTimeOriginal: '2024:05:01 14:30:00' });
		for (const file of [exifHeic({ tiff }), exifPng({ tiff })]) {
			const output = await exifr.parse(file, { mergeOutput: false, reviveValues: false });
			expect(output.ifd0).toMatchObject({ Make: 'Apple' });
			expect(output.exif).toMatchObject({ DateTimeOriginal: '2024:05:01 14:30:00' });
		}
	});
});

describe('parseImageMetadata: capture time', () => {
	it('takes DateTimeOriginal over CreateDate and ModifyDate, with its own offset', async () => {
		const parsed = await parse({
			dateTimeOriginal: '2024:05:01 14:30:00',
			offsetTimeOriginal: '+02:00',
			createDate: '2024:05:03 09:00:00',
			offsetTimeDigitized: '-05:00',
			modifyDate: '2024:06:01 08:00:00',
			offsetTime: '+09:00'
		});
		expect(parsed.capturedAt).toBe('2024-05-01T14:30:00');
		expect(parsed.capturedOffset).toBe('+02:00');
	});

	it('never uses the modification date', async () => {
		const parsed = await parse({ modifyDate: '2024:06:01 08:00:00', offsetTime: '+09:00' });
		expect(parsed.capturedAt).toBeNull();
		expect(parsed.capturedOffset).toBeNull();
		// Still recorded, as data.
		expect(parsed.metadata?.ifd0?.ModifyDate).toBe('2024-06-01T08:00:00');
	});

	it('falls back to CreateDate with its own offset, not the original’s', async () => {
		const parsed = await parse({
			createDate: '2019:07:04 18:30:05',
			offsetTimeDigitized: '-04:00',
			offsetTimeOriginal: '+01:00'
		});
		expect(parsed).toMatchObject({ capturedAt: '2019-07-04T18:30:05', capturedOffset: '-04:00' });
	});

	it('skips an unusable DateTimeOriginal for the next source', async () => {
		const parsed = await parse({
			dateTimeOriginal: '0000:00:00 00:00:00',
			offsetTimeOriginal: '+02:00',
			createDate: '2019:07:04 18:30:05'
		});
		expect(parsed).toMatchObject({ capturedAt: '2019-07-04T18:30:05', capturedOffset: null });
	});

	it('falls back to XMP photoshop:DateCreated, offset included', async () => {
		const parsed = await parse({
			modifyDate: '2024:06:01 08:00:00',
			xmp: xmpPacket('<photoshop:DateCreated>1987-03-14T09:15:00+01:00</photoshop:DateCreated>')
		});
		expect(parsed).toMatchObject({ capturedAt: '1987-03-14T09:15:00', capturedOffset: '+01:00' });
	});

	it('keeps an XMP date that names only the day as just the day', async () => {
		const parsed = await parse({
			xmp: xmpPacket('', 'photoshop:DateCreated="1923-08-02" xmp:CreateDate="2024-05-01T10:00:00Z"')
		});
		expect(parsed).toMatchObject({ capturedAt: '1923-08-02', capturedOffset: null });
	});

	it('ignores XMP dates coarser than a day', async () => {
		for (const date of ['1923', '1923-08']) {
			const parsed = await parse({ xmp: xmpPacket('', `photoshop:DateCreated="${date}"`) });
			expect(parsed.capturedAt).toBeNull();
		}
	});

	it('then tries XMP exif:DateTimeOriginal and xmp:CreateDate, never xmp:ModifyDate', async () => {
		const original = await parse({
			xmp: xmpPacket(
				'',
				'exif:DateTimeOriginal="2001-02-03T04:05:06" xmp:CreateDate="2002-01-01T00:00:00"'
			)
		});
		expect(original.capturedAt).toBe('2001-02-03T04:05:06');
		const created = await parse({
			xmp: xmpPacket('', 'xmp:CreateDate="2002-01-01T10:20:30-03:00"')
		});
		expect(created).toMatchObject({ capturedAt: '2002-01-01T10:20:30', capturedOffset: '-03:00' });
		const modified = await parse({ xmp: xmpPacket('', 'xmp:ModifyDate="2003-01-01T00:00:00"') });
		expect(modified.capturedAt).toBeNull();
	});

	it('takes OffsetTime only when ModifyDate is the capture moment itself', async () => {
		const capture = { dateTimeOriginal: '2024:05:01 14:30:00', offsetTime: '+09:00' };
		const unedited = await parse({ ...capture, modifyDate: '2024:05:01 14:30:00' });
		expect(unedited).toMatchObject({ capturedAt: '2024-05-01T14:30:00', capturedOffset: '+09:00' });
		// Edited later, perhaps elsewhere: that offset says nothing about the capture.
		const edited = await parse({ ...capture, modifyDate: '2024:06:01 08:00:00' });
		expect(edited.capturedOffset).toBeNull();
		const own = await parse({
			...capture,
			modifyDate: '2024:05:01 14:30:00',
			offsetTimeOriginal: '+02:00'
		});
		expect(own.capturedOffset).toBe('+02:00');
	});

	it('finds photoshop:DateCreated under whatever prefix the packet bound', async () => {
		const xmp =
			'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
			'<rdf:Description rdf:about="" xmlns:ps="http://ns.adobe.com/photoshop/1.0/" ps:DateCreated="1999-12-31T23:59:59"/>' +
			'</rdf:RDF></x:xmpmeta>';
		expect((await parse({ xmp })).capturedAt).toBe('1999-12-31T23:59:59');
	});

	it.each([
		'0000:00:00 00:00:00',
		'    :  :     :  :  ',
		'',
		'2023:13:01 10:00:00',
		'2023:04:31 10:00:00',
		'2023:02:29 10:00:00',
		'2024:05:01 24:00:00',
		'2024:05:01 12:60:00',
		'2024:05:01 12:00:60',
		'2024:05-01 12:00:00',
		'not a date'
	])('refuses the impossible date %j', async (date) => {
		const parsed = await parse({ dateTimeOriginal: date, offsetTimeOriginal: '+02:00' });
		expect(parsed).toMatchObject({ capturedAt: null, capturedOffset: null });
	});

	it.each([
		['2024:02:29 23:59:59', '2024-02-29T23:59:59'],
		['2024:05:01 14:30:00.123', '2024-05-01T14:30:00'],
		['2024-05-01 14:30:00', '2024-05-01T14:30:00'],
		['2024:05:01 14:30', '2024-05-01T14:30:00'],
		['2024:05:01 14:30:00\0\0garbage', '2024-05-01T14:30:00'],
		[' 2024:05:01 14:30:00 ', '2024-05-01T14:30:00']
	])('reads %j as %s', async (date, expected) => {
		expect((await parse({ dateTimeOriginal: date })).capturedAt).toBe(expected);
	});

	it.each([
		['+02:00', '+02:00'],
		['-05:30', '-05:30'],
		['+0530', '+05:30'],
		['+14:00', '+14:00'],
		['+00:00', '+00:00'],
		['Z', '+00:00'],
		['-00:00', null],
		['+14:30', null],
		['+02:75', null],
		['+2:00', null],
		['   :  ', null],
		['junk', null]
	])('normalizes the offset %j to %s', async (offset, expected) => {
		const parsed = await parse({
			dateTimeOriginal: '2024:05:01 14:30:00',
			offsetTimeOriginal: offset
		});
		expect(parsed.capturedOffset).toBe(expected);
	});
});

describe('parseImageMetadata: the stored record', () => {
	it('keeps the segments, with GPS position and normalized dates', async () => {
		const { metadata } = await parse({
			make: 'Apple',
			model: 'iPhone 15',
			dateTimeOriginal: '2024:05:01 14:30:00',
			createDate: '0000:00:00 00:00:00',
			exposureTime: [1, 250],
			gps: { lat: -33.8568, lon: 151.2153 }
		});
		expect(metadata?.ifd0).toMatchObject({ Make: 'Apple', Model: 'iPhone 15' });
		expect(metadata?.exif).toMatchObject({
			DateTimeOriginal: '2024-05-01T14:30:00',
			// Not a real date, so kept as the camera wrote it.
			CreateDate: '0000:00:00 00:00:00',
			ExposureTime: 0.004
		});
		expect(metadata?.gps).toMatchObject({
			GPSLatitudeRef: 'S',
			GPSLongitudeRef: 'E',
			// Small byte arrays survive as plain numbers.
			GPSVersionID: [2, 3, 0, 0]
		});
		expect(metadata?.gps?.latitude).toBeCloseTo(-33.8568, 6);
		expect(metadata?.gps?.longitude).toBeCloseTo(151.2153, 6);
		expect(metadata?.omitted).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
	});

	it('reads Motorola (big-endian) blocks as well as Intel ones', async () => {
		const parsed = await parse({
			bigEndian: true,
			make: 'Nikon',
			dateTimeOriginal: '2024:05:01 14:30:00',
			offsetTimeOriginal: '+02:00',
			gps: { lat: 48.8584, lon: 2.2945 }
		});
		expect(parsed).toMatchObject({ capturedAt: '2024-05-01T14:30:00', capturedOffset: '+02:00' });
		expect(parsed.metadata?.ifd0).toEqual({ Make: 'Nikon' });
		expect(parsed.metadata?.gps?.latitude).toBeCloseTo(48.8584, 6);
	});

	it('drops binary values, so the record round-trips through JSON', async () => {
		const makerNote = new Uint8Array(4096).map((_, i) => i % 251);
		const { metadata } = await parse({
			make: 'Nikon',
			dateTimeOriginal: '2024:05:01 14:30:00',
			makerNote
		});
		expect(metadata?.exif).not.toHaveProperty('MakerNote');
		for (const value of leaves(metadata)) {
			expect(ArrayBuffer.isView(value) || value instanceof ArrayBuffer).toBe(false);
			expect(typeof value === 'number' && !Number.isFinite(value)).toBe(false);
		}
		expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata);
	});

	it('cleans strings: no control characters, and a length cap', async () => {
		const { metadata } = await parse({
			make: 'Ca\u0001non\u0000',
			model: 'x'.repeat(5000)
		});
		expect(metadata?.ifd0?.Make).toBe('Canon');
		expect(metadata?.ifd0?.Model).toBe('x'.repeat(2000));
	});

	it('decodes Windows XP tags from UTF-16', async () => {
		const utf16 = (value: string) => new Uint8Array(Buffer.from(`${value}\0`, 'utf16le'));
		const { metadata } = await parse({
			ifd0Fields: [
				{ tag: 0x9c9b, type: BYTE, data: utf16('Ölfest – 1987') },
				{ tag: 0x9c9e, type: BYTE, data: utf16('harbour;dawn') }
			]
		});
		expect(metadata?.ifd0).toMatchObject({ XPTitle: 'Ölfest – 1987', XPKeywords: 'harbour;dawn' });
	});

	it('drops numeric tables, rational ones included, but keeps short lists', async () => {
		const rationals = (count: number) => {
			const data = new Uint8Array(count * 8);
			const view = new DataView(data.buffer);
			for (let i = 0; i < count; i++) {
				view.setUint32(i * 8, i + 1, true);
				view.setUint32(i * 8 + 4, 4, true);
			}
			return data;
		};
		const { metadata } = await parse({
			make: 'Phase One',
			exifFields: [
				{ tag: 0xc001, type: RATIONAL, data: rationals(3) },
				{ tag: 0xc002, type: RATIONAL, data: rationals(65) },
				{ tag: 0xc003, type: SHORT, data: new Uint8Array(65 * 2) },
				// Empty byte strings carry nothing; they must not become ''.
				{ tag: 0xc004, type: UNDEFINED, data: new Uint8Array(0), count: 0 }
			]
		});
		expect(metadata?.exif).toEqual({ 49153: [0.25, 0.5, 0.75] });
	});

	it('is null when the photograph carries nothing', async () => {
		expect(await parse({})).toEqual({ capturedAt: null, capturedOffset: null, metadata: null });
	});

	it('keeps XMP grouped by namespace, without the namespace bindings', async () => {
		const { metadata } = await parse({
			xmp: xmpPacket(
				'<dc:subject><rdf:Bag><rdf:li>harbour</rdf:li><rdf:li>dawn</rdf:li></rdf:Bag></dc:subject>',
				'photoshop:City="Sydney"'
			)
		});
		expect(metadata?.xmp).toEqual({
			photoshop: { City: 'Sydney' },
			dc: { subject: ['harbour', 'dawn'] }
		});
	});

	it('decodes IPTC written as UTF-8', async () => {
		const { metadata } = await parse({
			iptc: [
				[25, 'Café'],
				[25, 'Zürich'],
				[120, 'Opening night — the façade']
			]
		});
		expect(metadata?.iptc).toMatchObject({
			Keywords: ['Café', 'Zürich'],
			Caption: 'Opening night — the façade'
		});
	});

	it('summarizes the color profile instead of keeping it', async () => {
		for (const version of [2, 4] as const) {
			const icc = iccProfile({ description: 'Display P3', copyright: 'Apple Inc.', version });
			const { metadata } = await parse({ icc });
			expect(metadata?.icc).toEqual({
				ProfileDescription: 'Display P3',
				ProfileCopyright: 'Apple Inc.',
				ProfileClass: 'Display Device Profile',
				ColorSpaceData: 'RGB',
				ProfileConnectionSpace: 'XYZ',
				ProfileVersion: version === 2 ? '2.1.0' : '4.3.0',
				ProfileCMMType: 'lcms',
				PrimaryPlatform: 'Apple Computer Inc.',
				DeviceManufacturer: 'APPL',
				RenderingIntent: 'Perceptual',
				ProfileCreator: 'lcms'
			});
		}
	});

	it('reassembles a profile split across APP2 segments', async () => {
		const icc = iccProfile({ description: 'Wide Gamut RGB' });
		const { metadata } = await parse({ icc, iccChunkBytes: 50 });
		expect(metadata?.icc?.ProfileDescription).toBe('Wide Gamut RGB');
	});

	it('survives a profile whose description claims billions of zero-size records', async () => {
		const { metadata } = await parse({ icc: hostileIcc() });
		expect(metadata?.icc).toMatchObject({ ColorSpaceData: 'RGB' });
	});
});

describe('parseImageMetadata: what exifr must never parse', () => {
	it('refuses a packet whose prefixes name Object built-ins, without polluting anything', async () => {
		const xmp = xmpPacket(
			'<__proto__:polluted>yes</__proto__:polluted>',
			'constructor:keys="nope" a_toString:x="1"'
		);
		const parsed = await parse({ dateTimeOriginal: '2024:05:01 14:30:00', xmp });
		expectNoPollution();
		expect(parsed.capturedAt).toBe('2024-05-01T14:30:00');
		expect(parsed.metadata?.xmp).toBeUndefined();
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0][0])).toContain('XMP');
	});

	it('never hands the XMP, IPTC or ICC a TIFF block embeds to exifr’s own readers', async () => {
		// exifr would parse these IFD0 tags with its unsafe readers were they on:
		// the XMP would pollute, the profile would spin forever.
		const xmp = xmpPacket('<__proto__:polluted>yes</__proto__:polluted>', 'constructor:keys="x"');
		const parsed = await parse({
			make: 'Canon',
			dateTimeOriginal: '2024:05:01 14:30:00',
			ifd0Fields: [
				{ tag: 0x02bc, type: BYTE, data: text(xmp) },
				{ tag: 0x83bb, type: UNDEFINED, data: Uint8Array.of(0x1c, 2, 25, 0, 3, 0x61, 0x62, 0x63) },
				{ tag: 0x8773, type: UNDEFINED, data: hostileIcc() }
			]
		});
		expectNoPollution();
		expect(parsed.capturedAt).toBe('2024-05-01T14:30:00');
		expect(parsed.metadata?.ifd0).toEqual({ Make: 'Canon' });
		expect(parsed.metadata).not.toHaveProperty('xmp');
		expect(parsed.metadata).not.toHaveProperty('iptc');
		expect(parsed.metadata).not.toHaveProperty('icc');
	});

	it('keeps the IPTC datasets the block holds whole, never the bytes that follow it', async () => {
		// The caption holds 5 bytes but claims more: running into the EXIF
		// segment after it, past the end of the file, or an extended length.
		for (const declared of [200, 60000, 0x8004]) {
			const iim = concatBytes(
				IPTC_UTF8,
				iptcDataset(2, 25, text('kw')),
				iptcDataset(2, 120, text('Hello'), declared)
			);
			const bytes = exifJpeg({
				// Ahead of the EXIF segment, so the block has a camera's bytes after it.
				prelude: iptcSegment(iim),
				make: 'Canon',
				dateTimeOriginal: '2024:05:01 14:30:00',
				gps: { lat: 51.5, lon: -0.12 }
			});
			// Only the first claim ends inside the file, among the EXIF segment's bytes.
			const claimEnd = Buffer.from(bytes).indexOf('Hello') + declared;
			expect(claimEnd <= bytes.length).toBe(declared === 200);

			const parsed = await parseImageMetadata(bytes);
			expect(parsed.metadata?.iptc).toEqual({ Keywords: 'kw' });
			expect(parsed.capturedAt).toBe('2024-05-01T14:30:00');
			expect(parsed.metadata?.ifd0).toEqual({ Make: 'Canon' });
		}
	});

	it('still reads a packet that merely mentions such a word in its text', async () => {
		const { metadata } = await parse({
			xmp: xmpPacket('<dc:description>The constructor: Bob. toString and valueOf.</dc:description>')
		});
		expect(metadata?.xmp).toEqual({
			dc: { description: 'The constructor: Bob. toString and valueOf.' }
		});
	});
});

describe('parseImageMetadata: forged TIFF blocks', () => {
	it('hands exifr a bounded block however many entries share one long value', async () => {
		// exifr reads every entry's value in full: 2,000 entries all pointing at
		// one 32 KB value would cost seconds. Values beyond twice a block's worth
		// (more than a real block's can add up to) are emptied first.
		const count = 2000;
		const tiff = forgedTiff(
			Array.from({ length: count }, (_, i) => [0xc000 + i, SHORT, 16_000, valuesAt(count)]),
			new Uint8Array(32_000)
		);
		const parsed = await parseImageMetadata(exifPng({ tiff }));
		expect(exifrInputs).toHaveLength(1);
		const handed = exifrInputs[0] as Uint8Array;
		expect(claimedValueBytes(tiff)).toBe(count * 32_000);
		expect(claimedValueBytes(handed)).toBeGreaterThan(0);
		expect(claimedValueBytes(handed)).toBeLessThanOrEqual(2 * 64 * 1024);
		// Tables of 16,000 numbers are dropped from the record anyway.
		expect(parsed.metadata).toBeNull();
	});

	it('reads the rest of an IFD past entries exifr would give up on', async () => {
		const at = valuesAt(5);
		const tiff = forgedTiff(
			[
				[0x0100, 99, 1, 0], // no such type
				[0x0101, LONG, 0x4000_0000, at], // a count far past the block
				[0x010e, ASCII, 40, 0xfff0], // a value outside the block
				[0x010f, ASCII, 6, at],
				[0x0110, ASCII, 7, at + 6]
			],
			text('Canon\0EOS R5\0')
		);
		const parsed = await parseImageMetadata(exifPng({ tiff }));
		expect(parsed.metadata?.ifd0).toEqual({ Make: 'Canon', Model: 'EOS R5' });
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		['IFD0 itself', [0x8769, LONG, 1, 8]],
		['the header', [0x8769, LONG, 1, 2]],
		['a string', [0x8769, ASCII, 3, 0x0031_3200]],
		['a list', [0x8769, LONG, 2, 0]],
		['past the block', [0x8825, LONG, 1, 0xfff0]]
	] as const)('follows no Exif or GPS pointer to %s', async (_, pointer) => {
		const tiff = forgedTiff([[0x010f, ASCII, 6, valuesAt(2)], [...pointer]], text('Canon\0'));
		const parsed = await parseImageMetadata(exifPng({ tiff }));
		expect(parsed.metadata).toEqual({ ifd0: { Make: 'Canon' } });
		// Not followed at all, rather than followed into an error.
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('parseImageMetadata: size cap', () => {
	// Backslashes double when serialized, so these blow up past the cap as JSON
	// while still fitting their container.
	const bulkyXmp = () =>
		xmpPacket(
			Array.from(
				{ length: 30 },
				(_, i) => `<photoshop:Bulk${i}>${'\\'.repeat(1900)}</photoshop:Bulk${i}>`
			).join('')
		);

	it('drops XMP first and says so, keeping the date it carried', async () => {
		const xmp = bulkyXmp().replace(
			'<photoshop:Bulk0>',
			'<photoshop:DateCreated>1987-03-14</photoshop:DateCreated><photoshop:Bulk0>'
		);
		const parsed = await parse({ make: 'Leica', xmp });
		expect(parsed.capturedAt).toBe('1987-03-14');
		expect(parsed.metadata?.xmp).toBeUndefined();
		expect(parsed.metadata?.omitted).toEqual(['xmp']);
		expect(parsed.metadata?.ifd0).toEqual({ Make: 'Leica' });
		expect(jsonBytes(parsed.metadata)).toBeLessThanOrEqual(MAX_METADATA_JSON_BYTES);
	});

	it('then cuts EXIF down to its essentials', async () => {
		const parsed = await parse({
			make: 'Leica',
			dateTimeOriginal: '2024:05:01 14:30:00',
			offsetTimeOriginal: '+02:00',
			fNumber: [56, 10],
			exifStrings: Array.from({ length: 30 }, (_, i) => [0xa500 + i, '\\'.repeat(1900)]),
			xmp: bulkyXmp()
		});
		expect(parsed.metadata?.omitted).toEqual(['xmp', 'exif']);
		expect(parsed.metadata?.exif).toEqual({
			DateTimeOriginal: '2024-05-01T14:30:00',
			OffsetTimeOriginal: '+02:00',
			FNumber: 5.6
		});
		expect(parsed.metadata?.ifd0).toEqual({ Make: 'Leica' });
		expect(parsed.capturedAt).toBe('2024-05-01T14:30:00');
		expect(jsonBytes(parsed.metadata)).toBeLessThanOrEqual(MAX_METADATA_JSON_BYTES);
	});
});

describe('parseImageMetadata: containers', () => {
	const tiff = exifTiff({
		make: 'Google',
		dateTimeOriginal: '2023:12:24 18:00:00',
		offsetTimeOriginal: '-08:00',
		gps: { lat: 37.422, lon: -122.084 }
	});
	const xmp = xmpPacket('', 'photoshop:City="Mountain View"');
	const icc = iccProfile({ description: 'sRGB IEC61966-2.1' });

	const expectFullRead = (parsed: Awaited<ReturnType<typeof parseImageMetadata>>) => {
		expect(parsed).toMatchObject({ capturedAt: '2023-12-24T18:00:00', capturedOffset: '-08:00' });
		expect(parsed.metadata?.ifd0).toEqual({ Make: 'Google' });
		expect(parsed.metadata?.gps?.latitude).toBeCloseTo(37.422, 6);
		expect(parsed.metadata?.xmp).toEqual({ photoshop: { City: 'Mountain View' } });
		expect(parsed.metadata?.icc?.ProfileDescription).toBe('sRGB IEC61966-2.1');
		expect(warn).not.toHaveBeenCalled();
	};

	it('reads a HEIC’s Exif item, XMP item and colr profile', async () => {
		expectFullRead(await parseImageMetadata(exifHeic({ tiff, xmp, icc })));
		warn.mockClear();
		expectFullRead(await parseImageMetadata(exifHeic({ tiff, xmp, icc, exifOffsetZero: true })));
	});

	it.each([
		['split across extents', { extentBytes: 64 }],
		['stored in idat', { storage: 'idat' }],
		['with 32-bit item ids, in idat, split', { ilocVersion: 2, storage: 'idat', extentBytes: 100 }]
	] as const)('reads HEIC items %s', async (_, layout) => {
		expectFullRead(await parseImageMetadata(exifHeic({ tiff, xmp, icc, ...layout })));
	});

	it('reads a PNG’s eXIf, iTXt and iCCP chunks', async () => {
		expectFullRead(await parseImageMetadata(exifPng({ tiff, xmp, icc })));
		warn.mockClear();
		const variant = exifPng({ tiff, xmp, icc, xmpCompressed: true, exifPrefix: true });
		expectFullRead(await parseImageMetadata(variant));
	});

	it('tries only a PNG’s first iCCP and first XMP chunk', async () => {
		// A file of thousands of bombs would otherwise cost one inflate each.
		const bomb = deflateSync(new Uint8Array(8 * 1024 * 1024));
		const parsed = await parseImageMetadata(
			exifPng({
				tiff,
				icc,
				xmp,
				chunks: [
					['iCCP', pngIccp(bomb)],
					['iTXt', pngXmpText(text('not a zlib stream'), 1)]
				]
			})
		);
		expect(parsed.capturedAt).toBe('2023-12-24T18:00:00');
		expect(parsed.metadata?.icc).toBeUndefined();
		expect(parsed.metadata?.xmp).toBeUndefined();
		expect(parsed.metadata?.omitted).toEqual(['icc']);
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0][0])).toContain('PNG xmp');
	});

	it('resynchronizes past other segments, stray bytes and fill bytes', async () => {
		const prelude = concatBytes(
			jpegSegment(0xe0, text('JFIF\0'), Uint8Array.of(1, 2, 0, 0, 1, 0, 1, 0, 0)),
			Uint8Array.of(0x00, 0x13, 0x37),
			Uint8Array.of(0xff, 0xff, 0xff)
		);
		const parsed = await parse({
			prelude,
			dateTimeOriginal: '2024:05:01 14:30:00',
			make: 'Fujifilm'
		});
		expect(parsed.capturedAt).toBe('2024-05-01T14:30:00');
		expect(parsed.metadata?.ifd0).toEqual({ Make: 'Fujifilm' });
	});

	it('reads a WebP’s EXIF, XMP and ICCP chunks, with or without a JPEG preamble', async () => {
		expectFullRead(await parseImageMetadata(exifWebp({ tiff, xmp, icc })));
		warn.mockClear();
		expectFullRead(await parseImageMetadata(exifWebp({ tiff, xmp, icc, exifPrefix: true })));
	});

	it('refuses to inflate a PNG profile past the cap', async () => {
		const bomb = deflateSync(new Uint8Array(8 * 1024 * 1024));
		const parsed = await parseImageMetadata(exifPng({ tiff, iccCompressed: bomb }));
		expect(parsed.capturedAt).toBe('2023-12-24T18:00:00');
		expect(parsed.metadata?.icc).toBeUndefined();
		expect(parsed.metadata?.omitted).toEqual(['icc']);
	});

	it('finishes on a HEIF whose boxes are zero-sized, oversized or truncated', async () => {
		const valid = exifHeic({ tiff });
		const ftypEnd = new DataView(valid.buffer).getUint32(0);
		const zeroBox = concatBytes(Uint8Array.of(0, 0, 0, 0), new TextEncoder().encode('free'));
		const hugeBox = concatBytes(
			Uint8Array.of(0, 0, 0, 1),
			new TextEncoder().encode('free'),
			Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xf0)
		);
		for (const hostile of [
			concatBytes(valid.subarray(0, ftypEnd), zeroBox, valid.subarray(ftypEnd)),
			concatBytes(valid.subarray(0, ftypEnd), hugeBox, valid.subarray(ftypEnd)),
			valid.subarray(0, valid.length - 40)
		]) {
			expect((await parseImageMetadata(hostile)).capturedAt).toBeNull();
		}
	});

	it.each([
		['a WebP with no metadata', exifWebp()],
		['a PNG with no metadata', exifPng()],
		['a GIF', new TextEncoder().encode('GIF89a\x01\x00\x01\x00\x00\x00\x00;')],
		['garbage', new Uint8Array(1024).map((_, i) => (i * 7919) % 256)],
		['an empty file', new Uint8Array(0)],
		['a truncated JPEG', exifJpeg({ dateTimeOriginal: '2024:05:01 14:30:00' }).subarray(0, 30)],
		[
			'a JPEG whose EXIF is not TIFF',
			concatBytes(
				Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0, 16),
				new TextEncoder().encode('Exif\0\0junkjunk')
			)
		]
	])('returns all nulls for %s', async (_, bytes) => {
		expect(await parseImageMetadata(bytes)).toEqual({
			capturedAt: null,
			capturedOffset: null,
			metadata: null
		});
	});

	it('never throws, and warns once when reading fails outright', async () => {
		class Unreadable extends Uint8Array {
			override subarray(): Uint8Array<ArrayBuffer> {
				throw new Error('disk on fire');
			}
		}
		const bytes = Unreadable.from(exifJpeg({ dateTimeOriginal: '2024:05:01 14:30:00' }));
		expect(await parseImageMetadata(bytes)).toEqual({
			capturedAt: null,
			capturedOffset: null,
			metadata: null
		});
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0][0])).toContain('disk on fire');
	});
});
