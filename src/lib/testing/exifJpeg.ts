import { deflateSync } from 'node:zlib';

// Hand-built image files carrying photo metadata, for the metadata parser's
// specs (server project). The containers are real — JPEG markers, PNG chunks,
// RIFF chunks, ISO-BMFF boxes — and so is the TIFF/EXIF block inside them, but
// there are no pixels: nothing a metadata reader looks at is faked, and no
// binary fixture files live in the repository.

const ASCII_TYPE = 2;
const SHORT_TYPE = 3;
const LONG_TYPE = 4;
const RATIONAL_TYPE = 5;
const BYTE_TYPE = 1;
const UNDEFINED_TYPE = 7;

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;

const encoder = new TextEncoder();
const text = (value: string) => encoder.encode(value);

/** The bytes of `parts`, end to end. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

const be16 = (n: number) => Uint8Array.of(n >>> 8, n & 0xff);
const be32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const le32 = (n: number) => Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24);

/** EXIF fields to write, as a camera would record them (raw strings, not parsed values). */
export type ExifOptions = {
	make?: string;
	model?: string;
	/** IFD0 DateTime (exifr: ModifyDate), e.g. `2024:05:01 14:30:00`. */
	modifyDate?: string;
	dateTimeOriginal?: string;
	/** DateTimeDigitized (exifr: CreateDate). */
	createDate?: string;
	/** ModifyDate's offset, e.g. `+02:00`. */
	offsetTime?: string;
	offsetTimeOriginal?: string;
	offsetTimeDigitized?: string;
	/** As a [numerator, denominator] rational, e.g. [1, 250]. */
	exposureTime?: [number, number];
	fNumber?: [number, number];
	iso?: number;
	/** Decimal degrees; written as degree/minute/second rationals plus N/S, E/W refs. */
	gps?: { lat: number; lon: number };
	/** Opaque vendor bytes, as cameras write them (an UNDEFINED-type MakerNote). */
	makerNote?: Uint8Array;
	/** Extra ASCII tags in the Exif IFD, e.g. to bulk the block up. */
	exifStrings?: [tag: number, value: string][];
	/** Extra fields of any type in IFD0 (Windows XP tags, embedded XMP/IPTC/ICC). */
	ifd0Fields?: TiffField[];
	/** Extra fields of any type in the Exif IFD. */
	exifFields?: TiffField[];
	/** Motorola (big-endian) byte order instead of Intel's. */
	bigEndian?: boolean;
};

/**
 * A raw TIFF field: its type number (1 BYTE, 2 ASCII, 3 SHORT, 4 LONG,
 * 5 RATIONAL, 7 UNDEFINED…) and its value's bytes, already in the block's byte
 * order. `count` defaults to the bytes divided by the type's size.
 */
export type TiffField = { tag: number; type: number; data: Uint8Array; count?: number };

type Field = Required<TiffField>;

/** Bytes per value of each TIFF type, by type number. */
const TYPE_BYTES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
function field({ tag, type, data, count }: TiffField): Field {
	if (count === undefined && !TYPE_BYTES[type]) {
		throw new Error(`TIFF type ${type} has no size: give the field a count`);
	}
	return { tag, type, data, count: count ?? data.length / TYPE_BYTES[type] };
}

/**
 * A complete TIFF structure as an EXIF block holds it: header, IFD0, and the
 * Exif and GPS sub-IFDs it points to. Values longer than four bytes go to a
 * data area after each IFD (word-aligned), as the format requires.
 */
export function exifTiff(options: ExifOptions = {}): Uint8Array {
	const le = !options.bigEndian;
	const numbers = (bytesEach: number, values: number[]) => {
		const data = new Uint8Array(bytesEach * values.length);
		const view = new DataView(data.buffer);
		values.forEach((value, i) =>
			bytesEach === 2 ? view.setUint16(i * 2, value, le) : view.setUint32(i * 4, value, le)
		);
		return data;
	};
	const ascii = (tag: number, value: string): Field => {
		const data = concatBytes(text(value), Uint8Array.of(0));
		return { tag, type: ASCII_TYPE, count: data.length, data };
	};
	const short = (tag: number, value: number): Field => ({
		tag,
		type: SHORT_TYPE,
		count: 1,
		data: numbers(2, [value])
	});
	const long = (tag: number, value: number): Field => ({
		tag,
		type: LONG_TYPE,
		count: 1,
		data: numbers(4, [value])
	});
	const rationals = (tag: number, values: [number, number][]): Field => ({
		tag,
		type: RATIONAL_TYPE,
		count: values.length,
		data: numbers(4, values.flat())
	});
	const bytes = (tag: number, type: number, data: Uint8Array): Field => ({
		tag,
		type,
		count: data.length,
		data
	});

	const ifd0: Field[] = [];
	if (options.make !== undefined) ifd0.push(ascii(0x010f, options.make));
	if (options.model !== undefined) ifd0.push(ascii(0x0110, options.model));
	if (options.modifyDate !== undefined) ifd0.push(ascii(0x0132, options.modifyDate));
	ifd0.push(...(options.ifd0Fields ?? []).map(field));

	const exif: Field[] = [];
	if (options.exposureTime) exif.push(rationals(0x829a, [options.exposureTime]));
	if (options.fNumber) exif.push(rationals(0x829d, [options.fNumber]));
	if (options.iso !== undefined) exif.push(short(0x8827, options.iso));
	if (options.dateTimeOriginal !== undefined) exif.push(ascii(0x9003, options.dateTimeOriginal));
	if (options.createDate !== undefined) exif.push(ascii(0x9004, options.createDate));
	if (options.offsetTime !== undefined) exif.push(ascii(0x9010, options.offsetTime));
	if (options.offsetTimeOriginal !== undefined) {
		exif.push(ascii(0x9011, options.offsetTimeOriginal));
	}
	if (options.offsetTimeDigitized !== undefined) {
		exif.push(ascii(0x9012, options.offsetTimeDigitized));
	}
	if (options.makerNote) exif.push(bytes(0x927c, UNDEFINED_TYPE, options.makerNote));
	for (const [tag, value] of options.exifStrings ?? []) exif.push(ascii(tag, value));
	exif.push(...(options.exifFields ?? []).map(field));

	const gps: Field[] = [];
	if (options.gps) {
		const { lat, lon } = options.gps;
		gps.push(
			bytes(0x0000, BYTE_TYPE, Uint8Array.of(2, 3, 0, 0)),
			ascii(0x0001, lat < 0 ? 'S' : 'N'),
			rationals(0x0002, degreesMinutesSeconds(lat)),
			ascii(0x0003, lon < 0 ? 'W' : 'E'),
			rationals(0x0004, degreesMinutesSeconds(lon))
		);
	}

	// The sub-IFD pointers' values depend on the layout, but their size doesn't:
	// lay out with placeholders, then point them at where the IFDs landed.
	if (exif.length > 0) ifd0.push(long(TAG_EXIF_IFD, 0));
	if (gps.length > 0) ifd0.push(long(TAG_GPS_IFD, 0));
	const ifd0At = 8;
	const exifAt = ifd0At + ifdLength(ifd0);
	const gpsAt = exifAt + (exif.length > 0 ? ifdLength(exif) : 0);
	const end = gpsAt + (gps.length > 0 ? ifdLength(gps) : 0);
	const pointed = ifd0.map((field) =>
		field.tag === TAG_EXIF_IFD
			? long(TAG_EXIF_IFD, exifAt)
			: field.tag === TAG_GPS_IFD
				? long(TAG_GPS_IFD, gpsAt)
				: field
	);

	const out = new Uint8Array(end);
	const view = new DataView(out.buffer);
	out.set(le ? [0x49, 0x49, 0x2a, 0x00] : [0x4d, 0x4d, 0x00, 0x2a]);
	view.setUint32(4, ifd0At, le);
	writeIfd(out, view, ifd0At, pointed, le);
	if (exif.length > 0) writeIfd(out, view, exifAt, exif, le);
	if (gps.length > 0) writeIfd(out, view, gpsAt, gps, le);
	return out;
}

const wordAligned = (n: number) => n + (n % 2);

/** Entry count, entries, next-IFD pointer, then the out-of-line values. */
function ifdLength(fields: Field[]): number {
	const values = fields.reduce(
		(sum, field) => sum + (field.data.length > 4 ? wordAligned(field.data.length) : 0),
		0
	);
	return 2 + 12 * fields.length + 4 + values;
}

function writeIfd(out: Uint8Array, view: DataView, at: number, fields: Field[], le: boolean) {
	// Readers may binary-search an IFD, so entries go in ascending tag order.
	const sorted = [...fields].sort((a, b) => a.tag - b.tag);
	view.setUint16(at, sorted.length, le);
	let valueAt = at + 2 + 12 * sorted.length + 4;
	sorted.forEach((field, i) => {
		const entry = at + 2 + 12 * i;
		view.setUint16(entry, field.tag, le);
		view.setUint16(entry + 2, field.type, le);
		view.setUint32(entry + 4, field.count, le);
		if (field.data.length <= 4) {
			// Short values sit left-justified in the entry itself.
			out.set(field.data, entry + 8);
		} else {
			view.setUint32(entry + 8, valueAt, le);
			out.set(field.data, valueAt);
			valueAt += wordAligned(field.data.length);
		}
	});
	// Next-IFD pointer: none (no thumbnail IFD1).
	view.setUint32(at + 2 + 12 * sorted.length, 0, le);
}

function degreesMinutesSeconds(decimal: number): [number, number][] {
	const abs = Math.abs(decimal);
	const degrees = Math.floor(abs);
	const minutes = Math.floor((abs - degrees) * 60);
	const seconds = ((abs - degrees) * 60 - minutes) * 60;
	return [
		[degrees, 1],
		[minutes, 1],
		[Math.round(seconds * 10000), 10000]
	];
}

/**
 * An XMP packet with the usual namespaces declared on its rdf:Description, so
 * `properties` can use the photoshop:, xmp:, exif: and dc: prefixes directly
 * (as attributes or as elements).
 */
export function xmpPacket(properties: string, attributes = ''): string {
	return (
		'<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
		'<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
		'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
		'<rdf:Description rdf:about=""' +
		' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"' +
		' xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
		' xmlns:exif="http://ns.adobe.com/exif/1.0/"' +
		' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
		`${attributes ? ` ${attributes}` : ''}>` +
		properties +
		'</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
	);
}

export type IccProfileOptions = {
	description: string;
	copyright?: string;
	/** 2 writes the description as a `desc` (ASCII) tag, 4 as `mluc` (UTF-16). */
	version?: 2 | 4;
};

/**
 * A minimal display-class RGB ICC profile: the 128-byte header and a tag table
 * with the description and copyright — what a profile summary reads. No
 * colorimetric tags, so no color engine could use it.
 */
export function iccProfile({ description, copyright, version = 2 }: IccProfileOptions): Uint8Array {
	const textTag = (value: string, kind: 'desc' | 'cprt'): Uint8Array => {
		if (version === 4) {
			const utf16 = new Uint8Array(value.length * 2);
			for (let i = 0; i < value.length; i++) {
				utf16[i * 2] = value.charCodeAt(i) >>> 8;
				utf16[i * 2 + 1] = value.charCodeAt(i) & 0xff;
			}
			// One record (en-US) of the multi-localized Unicode type.
			return concatBytes(
				text('mluc'),
				be32(0),
				be32(1),
				be32(12),
				text('enUS'),
				be32(utf16.length),
				be32(28),
				utf16
			);
		}
		const ascii = concatBytes(text(value), Uint8Array.of(0));
		if (kind === 'cprt') return concatBytes(text('text'), be32(0), ascii);
		// textDescriptionType: ASCII, then empty Unicode and ScriptCode parts.
		return concatBytes(
			text('desc'),
			be32(0),
			be32(ascii.length),
			ascii,
			new Uint8Array(4 + 4 + 3 + 67)
		);
	};

	const tags: [string, Uint8Array][] = [['desc', textTag(description, 'desc')]];
	if (copyright !== undefined) tags.push(['cprt', textTag(copyright, 'cprt')]);

	const tableLength = 4 + 12 * tags.length;
	let dataAt = 128 + tableLength;
	const table: Uint8Array[] = [be32(tags.length)];
	const data: Uint8Array[] = [];
	for (const [signature, body] of tags) {
		table.push(text(signature), be32(dataAt), be32(body.length));
		const padded = concatBytes(body, new Uint8Array((4 - (body.length % 4)) % 4));
		data.push(padded);
		dataAt += padded.length;
	}

	const header = new Uint8Array(128);
	const view = new DataView(header.buffer);
	view.setUint32(0, dataAt);
	header.set(text('lcms'), 4);
	header.set(version === 4 ? [4, 0x30] : [2, 0x10], 8);
	header.set(text('mntr'), 12);
	header.set(text('RGB '), 16);
	header.set(text('XYZ '), 20);
	header.set([...be16(2024), ...be16(5), ...be16(1), ...be16(12), ...be16(0), ...be16(0)], 24);
	header.set(text('acsp'), 36);
	header.set(text('APPL'), 40);
	header.set(text('APPL'), 48);
	view.setUint32(64, 0); // perceptual
	header.set(text('lcms'), 80);
	return concatBytes(header, ...table, ...data);
}

export type ExifJpegOptions = ExifOptions & {
	/** An XMP packet for a second APP1 segment (see `xmpPacket`). */
	xmp?: string;
	/** An ICC profile, split across as many APP2 segments as `iccChunkBytes` requires. */
	icc?: Uint8Array;
	iccChunkBytes?: number;
	/** IPTC-IIM record 2 datasets for an APP13 segment, UTF-8 encoded: [dataset, value]. */
	iptc?: [dataset: number, value: string][];
	/** Bytes between SOI and the first segment: other segments, stray or fill bytes. */
	prelude?: Uint8Array;
};

/**
 * A JPEG that is all metadata: SOI, an APP1 EXIF segment (always, built from
 * the EXIF fields given), then the optional XMP APP1, ICC APP2 and IPTC APP13
 * segments, and EOI.
 */
export function exifJpeg(options: ExifJpegOptions = {}): Uint8Array {
	const segments = [jpegSegment(0xe1, text('Exif\0\0'), exifTiff(options))];
	if (options.xmp !== undefined) {
		segments.push(jpegSegment(0xe1, text('http://ns.adobe.com/xap/1.0/\0'), text(options.xmp)));
	}
	if (options.icc) {
		const size = options.iccChunkBytes ?? 65519;
		const count = Math.ceil(options.icc.length / size);
		if (count > 255) throw new Error(`ICC profile needs ${count} APP2 segments; 255 at most`);
		for (let i = 0; i < count; i++) {
			const chunk = options.icc.subarray(i * size, (i + 1) * size);
			segments.push(jpegSegment(0xe2, text('ICC_PROFILE\0'), Uint8Array.of(i + 1, count), chunk));
		}
	}
	if (options.iptc) {
		const datasets = options.iptc.map(([number, value]) => iptcDataset(2, number, text(value)));
		segments.push(iptcSegment(concatBytes(IPTC_UTF8, ...datasets)));
	}
	const prelude = options.prelude ?? new Uint8Array(0);
	return concatBytes(Uint8Array.of(0xff, 0xd8), prelude, ...segments, Uint8Array.of(0xff, 0xd9));
}

/** A JPEG marker segment: marker, length, body. */
export function jpegSegment(marker: number, ...parts: Uint8Array[]): Uint8Array {
	const body = concatBytes(...parts);
	const length = body.length + 2;
	if (length > 0xffff) throw new Error(`JPEG segment too large: ${length} bytes`);
	return concatBytes(Uint8Array.of(0xff, marker), be16(length), body);
}

/**
 * An IPTC-IIM dataset: marker, record, dataset number, 16-bit length, value.
 * `declaredLength` replaces the value's real length in the header, to forge a
 * dataset that claims more bytes than it holds.
 */
export function iptcDataset(
	record: number,
	number: number,
	value: Uint8Array,
	declaredLength = value.length
): Uint8Array {
	return concatBytes(Uint8Array.of(0x1c, record, number), be16(declaredLength), value);
}

/** 1:90 CodedCharacterSet = ESC % G, i.e. UTF-8. */
export const IPTC_UTF8 = iptcDataset(1, 90, Uint8Array.of(0x1b, 0x25, 0x47));

/**
 * An APP13 segment as Photoshop writes it: an image resource block holding one
 * IPTC resource (0x0404) of the IIM bytes given.
 */
export function iptcSegment(iim: Uint8Array): Uint8Array {
	return jpegSegment(
		0xed,
		text('Photoshop 3.0\0'),
		text('8BIM'),
		be16(0x0404),
		Uint8Array.of(0, 0), // empty Pascal-string name, padded to even
		be32(iim.length),
		iim,
		new Uint8Array(iim.length % 2)
	);
}

export type ContainerMetadata = {
	/** A TIFF/EXIF block (see `exifTiff`). */
	tiff?: Uint8Array;
	xmp?: string;
	icc?: Uint8Array;
};

export type PngOptions = ContainerMetadata & {
	/** Stands in for the iCCP profile's zlib stream (a bomb, a broken stream). */
	iccCompressed?: Uint8Array;
	/** Compress the XMP iTXt chunk's text, as the flag allows. */
	xmpCompressed?: boolean;
	/** Write eXIf with JPEG's `Exif\0\0` preamble, as some encoders do. */
	exifPrefix?: boolean;
	/** Raw chunks, [type, data], placed straight after IHDR: ahead of the metadata chunks. */
	chunks?: [type: string, data: Uint8Array][];
};

/**
 * A PNG with the metadata chunks photo tools write: eXIf (a bare TIFF block),
 * iTXt keyed `XML:com.adobe.xmp`, and iCCP (zlib-compressed profile), around a
 * placeholder IDAT.
 */
export function exifPng(options: PngOptions = {}) {
	const chunks = [pngChunk('IHDR', concatBytes(be32(1), be32(1), Uint8Array.of(8, 2, 0, 0, 0)))];
	for (const [type, data] of options.chunks ?? []) chunks.push(pngChunk(type, data));
	const icc = options.iccCompressed ?? (options.icc && deflateSync(options.icc));
	if (icc) chunks.push(pngChunk('iCCP', pngIccp(icc)));
	if (options.tiff) {
		const exif = options.exifPrefix ? concatBytes(text('Exif\0\0'), options.tiff) : options.tiff;
		chunks.push(pngChunk('eXIf', exif));
	}
	chunks.push(pngChunk('IDAT', deflateSync(Uint8Array.of(0, 0, 0, 0))));
	if (options.xmp !== undefined) {
		const xmp = text(options.xmp);
		const data = options.xmpCompressed ? pngXmpText(deflateSync(xmp), 1) : pngXmpText(xmp);
		chunks.push(pngChunk('iTXt', data));
	}
	chunks.push(pngChunk('IEND', new Uint8Array(0)));
	return concatBytes(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ...chunks);
}

/** iCCP chunk data: profile name, NUL, compression method 0, then the zlib stream. */
export const pngIccp = (compressed: Uint8Array) =>
	concatBytes(text('Display P3\0'), Uint8Array.of(0), compressed);

/**
 * iTXt chunk data keyed for XMP: keyword, compression flag and method, empty
 * language tag and translated keyword, then `body` as given (a zlib stream
 * when the flag is 1).
 */
export const pngXmpText = (body: Uint8Array, compressionFlag: 0 | 1 = 0) =>
	concatBytes(text('XML:com.adobe.xmp\0'), Uint8Array.of(compressionFlag, 0, 0, 0), body);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const typed = concatBytes(text(type), data);
	return concatBytes(be32(data.length), typed, be32(crc32(typed)));
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/**
 * An extended-format WebP: VP8X (with the metadata flags set), then ICCP, a
 * placeholder lossless frame, EXIF and `XMP ` chunks. `exifPrefix` writes the
 * EXIF chunk with JPEG's `Exif\0\0` preamble, as some encoders do.
 */
export function exifWebp(options: ContainerMetadata & { exifPrefix?: boolean } = {}): Uint8Array {
	const flags = (options.icc ? 0x20 : 0) | (options.tiff ? 0x08 : 0) | (options.xmp ? 0x04 : 0);
	const chunks = [riffChunk('VP8X', Uint8Array.of(flags, 0, 0, 0, 0, 0, 0, 0, 0, 0))];
	if (options.icc) chunks.push(riffChunk('ICCP', options.icc));
	chunks.push(riffChunk('VP8L', Uint8Array.of(0x2f, 0, 0, 0, 0)));
	if (options.tiff) {
		const exif = options.exifPrefix ? concatBytes(text('Exif\0\0'), options.tiff) : options.tiff;
		chunks.push(riffChunk('EXIF', exif));
	}
	if (options.xmp !== undefined) chunks.push(riffChunk('XMP ', text(options.xmp)));
	const body = concatBytes(text('WEBP'), ...chunks);
	return concatBytes(text('RIFF'), le32(body.length), body);
}

function riffChunk(type: string, data: Uint8Array): Uint8Array {
	return concatBytes(text(type), le32(data.length), data, new Uint8Array(data.length % 2));
}

export type HeicOptions = ContainerMetadata & {
	/** Write the Exif item's TIFF-header offset as 0 while keeping `Exif\0\0`, as some encoders do. */
	exifOffsetZero?: boolean;
	/**
	 * 1 (the default) as iPhones write; 2 for 32-bit item ids, which also
	 * writes iinf version 1 and infe version 3 (their 32-bit counterparts).
	 */
	ilocVersion?: 1 | 2;
	/** Where item bytes live: `mdat` at absolute offsets, or `idat` inside meta (construction method 1). */
	storage?: 'mdat' | 'idat';
	/** Split each item into extents of at most this many bytes. */
	extentBytes?: number;
};

/**
 * A HEIC laid out the way iPhones write one: ftyp, then a meta box whose item
 * table lists the (absent) primary image, an `Exif` item and an XMP `mime`
 * item, with their bytes in mdat at absolute offsets given by iloc (version
 * 1, construction method 0); the ICC profile is a `colr` property. The options
 * switch to the other layouts the format allows.
 */
export function exifHeic(options: HeicOptions = {}): Uint8Array {
	const items: { id: number; type: string; contentType?: string; data?: Uint8Array }[] = [
		{ id: 1, type: 'hvc1' }
	];
	if (options.tiff) {
		// An Exif item starts with the offset of the TIFF header past this field.
		const offset = options.exifOffsetZero ? 0 : 6;
		const data = concatBytes(be32(offset), text('Exif\0\0'), options.tiff);
		items.push({ id: 2, type: 'Exif', data });
	}
	if (options.xmp !== undefined) {
		items.push({
			id: 3,
			type: 'mime',
			contentType: 'application/rdf+xml',
			data: text(options.xmp)
		});
	}

	const wide = options.ilocVersion === 2;
	const id = (n: number) => (wide ? be32(n) : be16(n));
	const inIdat = options.storage === 'idat';
	const located = items.filter((item) => item.data);
	const stored = concatBytes(...located.map((item) => item.data!));
	const extents = (data: Uint8Array) => {
		const size = options.extentBytes ?? data.length;
		const parts: number[] = [];
		for (let at = 0; at < data.length; at += size) parts.push(Math.min(size, data.length - at));
		return parts;
	};

	const ftyp = box('ftyp', concatBytes(text('heic'), be32(0), text('mif1'), text('heic')));
	const meta = (mdatDataAt: number) => {
		// idat offsets count from the start of idat's payload, mdat ones from the file's.
		let at = inIdat ? 0 : mdatDataAt;
		const iloc = fullBox('iloc', wide ? 2 : 1, [
			Uint8Array.of(0x44, 0x00), // offset_size 4, length_size 4; base_offset_size 0, index_size 0
			wide ? be32(located.length) : be16(located.length),
			...located.map((item) => {
				const lengths = extents(item.data!);
				return concatBytes(
					id(item.id),
					be16(inIdat ? 1 : 0), // construction_method
					be16(0), // data_reference_index
					be16(lengths.length),
					...lengths.map((length) => {
						const extent = concatBytes(be32(at), be32(length));
						at += length;
						return extent;
					})
				);
			})
		]);
		const iinf = fullBox('iinf', wide ? 1 : 0, [
			wide ? be32(items.length) : be16(items.length),
			...items.map((item) =>
				fullBox('infe', wide ? 3 : 2, [
					id(item.id),
					be16(0),
					text(item.type),
					text('\0'),
					item.contentType ? text(`${item.contentType}\0`) : new Uint8Array(0)
				])
			)
		]);
		const properties = options.icc ? [box('colr', concatBytes(text('prof'), options.icc))] : [];
		const iprp = box('iprp', box('ipco', concatBytes(...properties)));
		return fullBox('meta', 0, [
			fullBox('hdlr', 0, [be32(0), text('pict'), new Uint8Array(12), text('\0')]),
			fullBox('pitm', 0, [be16(1)]),
			iinf,
			iloc,
			...(inIdat ? [box('idat', stored)] : []),
			iprp
		]);
	};
	// Box sizes don't depend on the offsets inside them: measure, then lay out for real.
	const mdatDataAt = ftyp.length + meta(0).length + 8;
	const mdat = box('mdat', inIdat ? new Uint8Array(0) : stored);
	return concatBytes(ftyp, meta(mdatDataAt), mdat);
}

function box(type: string, payload: Uint8Array): Uint8Array {
	return concatBytes(be32(8 + payload.length), text(type), payload);
}

function fullBox(type: string, version: number, parts: Uint8Array[]): Uint8Array {
	return box(type, concatBytes(Uint8Array.of(version, 0, 0, 0), ...parts));
}
